/**
 * Éditions d'un jeu de figurines.
 *
 * Certaines gammes traversent plusieurs **éditions** — des versions du jeu qui
 * ne sont pas toujours compatibles entre elles : Star Wars: Legion en compte
 * deux, et une boîte de la première ne se joue pas avec les règles de la
 * seconde. Un joueur qui parcourt le catalogue a besoin de le savoir avant
 * d'acheter, et de ne voir par défaut que ce qui se joue aujourd'hui.
 *
 * L'édition est portée par un **attribut de produit**, `edition`, et non par un
 * champ propre. C'est délibéré :
 *
 *  - la plupart des jeux n'en ont pas, et un champ de plus sur tous les produits
 *    de la plateforme pour deux gammes serait mal placé ;
 *  - les attributs sont déjà saisissables, relevés et proposés en autocomplétion
 *    par `/admin/products` — l'édition hérite de tout cela sans une ligne ;
 *  - un import peut la poser, et une correction manuelle lui survit.
 *
 * Ce qui n'est pas un attribut, c'est **l'édition en cours** : elle appartient
 * au jeu (`currentProductEdition`), se règle depuis l'administration, et c'est
 * elle qui décide de ce qu'on montre par défaut.
 */

/**
 * Clé de l'attribut qui porte l'édition. Elle respecte `cardAttributeKeySchema`
 * (une lettre, puis lettres, chiffres et « _ ») : sans accent, donc, là où le
 * reste de l'interface parle d'« édition ».
 */
export const PRODUCT_EDITION_ATTRIBUTE = "edition";

/** Chemin de l'attribut dans le document, pour les filtres et les projections. */
export const PRODUCT_EDITION_FIELD = `attributes.${PRODUCT_EDITION_ATTRIBUTE}`;

/** Valeur de filtre qui lève la restriction — « toutes éditions confondues ». */
export const ALL_EDITIONS = "all";

/**
 * Filtre Mongo des produits d'une édition.
 *
 * Un produit **sans édition n'appartient à aucune** : il ne ressort d'aucun
 * filtre d'édition, seulement de « toutes ». C'est ce qui donne son sens au
 * réglage — « dernière édition » veut dire ce qu'il dit —, et l'administration
 * affiche le nombre de produits non étiquetés pour qu'une gamme ne disparaisse
 * jamais des écrans sans qu'on sache pourquoi.
 */
export function editionFilter(edition: string | undefined): Record<string, unknown> {
  if (!edition || edition === ALL_EDITIONS) {
    return {};
  }

  return { [PRODUCT_EDITION_FIELD]: edition };
}

/**
 * L'édition à appliquer à une requête, du plus explicite au plus général :
 * ce que le client demande, sinon l'édition en cours du jeu, sinon rien.
 *
 * Le défaut est posé **côté serveur** plutôt que dans chaque écran : l'API est
 * lue par le site, par l'application mobile et par des agents, et « par défaut,
 * la dernière édition » doit valoir pour tous. Un client qui veut le catalogue
 * entier le demande, avec `edition=all`.
 */
export function resolveEdition(
  requested: string | undefined,
  currentProductEdition: string | undefined
): string | undefined {
  if (requested) {
    return requested === ALL_EDITIONS ? undefined : requested;
  }

  return currentProductEdition || undefined;
}

/**
 * Périmètre d'édition des **statistiques de complétion**.
 *
 * Le catalogue paginé, lui, se contente d'une édition déjà résolue : la route
 * connaît le jeu qu'elle sert et son édition en cours. Les statistiques sont
 * lues autrement — la vue d'ensemble en calcule pour tous les jeux d'un coup,
 * chacun avec son édition en cours —, d'où ce troisième cas qui ne se réduit
 * pas à une chaîne :
 *
 *  - `current` : l'édition en cours de **chaque** jeu, le défaut ;
 *  - `all` : tout le catalogue, éditions confondues ;
 *  - `edition` : une édition nommée, celle que l'écran demande.
 */
export type EditionScope =
  | { kind: "current" }
  | { kind: "all" }
  | { kind: "edition"; edition: string };

/** Le défaut : « la dernière édition », jeu par jeu. */
export const CURRENT_EDITION_SCOPE: EditionScope = { kind: "current" };

/**
 * Périmètre correspondant à une édition **déjà résolue** (celle que rend
 * `resolveEdition`) : nommée si elle l'est, tout le catalogue sinon. C'est le
 * pont entre une route, qui a tranché pour son jeu, et les statistiques, qui
 * savent en plus compter pour plusieurs.
 */
export function scopeOfEdition(edition: string | undefined): EditionScope {
  return edition ? { kind: "edition", edition } : { kind: "all" };
}

/**
 * L'édition qu'un périmètre désigne pour un jeu donné. `undefined` ne restreint
 * rien — c'est aussi ce que rend `current` pour un jeu qui n'a pas d'éditions.
 */
export function editionInScope(
  scope: EditionScope,
  currentProductEdition: string | undefined
): string | undefined {
  if (scope.kind === "all") {
    return undefined;
  }
  if (scope.kind === "edition") {
    return scope.edition;
  }

  return currentProductEdition || undefined;
}

/** Édition portée par un produit, si elle est renseignée et lisible. */
export function editionOf(attributes: Record<string, unknown> | undefined): string | undefined {
  const value = attributes?.[PRODUCT_EDITION_ATTRIBUTE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
