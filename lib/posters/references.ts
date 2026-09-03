/**
 * Ce qui désigne une affiche, hors de toute page.
 *
 * L'affiche du site n'a pas d'identité : elle est son adresse
 * (`lib/posters/selection.ts`). Une commande de bot, elle, n'a qu'un mot à
 * offrir — celui que l'utilisateur tape et que l'autocomplétion lui souffle —,
 * et il lui faut donc de quoi nommer les deux choses qu'un compte peut vouloir
 * afficher : une **affiche qu'il a gardée**, ou un **lieu qu'il suit**.
 *
 * Tout y est pur : la forme de la référence, et la façon de retrouver un nom
 * dans une liste. Ce qui touche à la base vit dans `lib/posters/library.ts`.
 */

export const POSTER_REF_KINDS = ["poster", "lair"] as const;

export type PosterRefKind = (typeof POSTER_REF_KINDS)[number];

/** Une affiche gardée, ou un lieu — et l'identifiant Mongo de l'un ou l'autre. */
export type PosterRef = {
  kind: PosterRefKind;
  id: string;
};

/** Ce qu'une liste de choix propose : une référence, et le nom qu'on lit. */
export type PosterChoice = PosterRef & {
  name: string;
};

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * La référence, telle qu'elle voyage dans la valeur d'une option Discord.
 *
 * `poster:<id>` tient en 31 caractères, très loin des 100 qu'une valeur
 * d'autocomplétion accepte.
 */
export function formatPosterRef(ref: PosterRef): string {
  return `${ref.kind}:${ref.id}`;
}

/**
 * La référence portée par une valeur, ou `null`.
 *
 * `null` n'est pas une erreur : c'est le cas ordinaire où l'utilisateur a tapé
 * un nom au lieu de choisir une suggestion. L'appelant retombe alors sur la
 * recherche par nom — refuser tout net obligerait à cliquer une suggestion,
 * là où taper « ma semaine » et valider doit marcher.
 */
export function parsePosterRef(value: string | undefined | null): PosterRef | null {
  if (!value) {
    return null;
  }

  const [kind, id, ...rest] = value.trim().split(":");

  if (rest.length > 0 || !(POSTER_REF_KINDS as readonly string[]).includes(kind) || !OBJECT_ID.test(id ?? "")) {
    return null;
  }

  return { kind: kind as PosterRefKind, id: id.toLowerCase() };
}

/**
 * Le texte réduit à ce qui se compare : sans accents, sans casse, sans bords.
 *
 * « Café des Jeux » se trouve en tapant « cafe » : une autocomplétion qui
 * exigerait l'accent serait une autocomplétion qu'on n'utilise pas.
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Les choix qui répondent à ce qui est tapé, les meilleurs d'abord.
 *
 * Trois rangs : ce qui commence par la saisie, puis ce qui la contient, puis
 * rien. L'ordre d'origine est conservé à l'intérieur d'un rang — la
 * bibliothèque arrive déjà triée, la dernière affiche touchée en tête, et il
 * n'y a aucune raison de rebattre cet ordre pour une saisie vide.
 */
export function matchPosterChoices(choices: PosterChoice[], query: string, limit = 25): PosterChoice[] {
  const needle = fold(query ?? "");

  if (needle.length === 0) {
    return choices.slice(0, limit);
  }

  const starts: PosterChoice[] = [];
  const contains: PosterChoice[] = [];

  for (const choice of choices) {
    const name = fold(choice.name);

    if (name.startsWith(needle)) {
      starts.push(choice);
    } else if (name.includes(needle)) {
      contains.push(choice);
    }
  }

  return [...starts, ...contains].slice(0, limit);
}

/**
 * Le choix que désigne un nom tapé à la main.
 *
 * Exact d'abord, puis le premier que la recherche remonte : quelqu'un qui tape
 * « caverne » sans attendre la suggestion obtient l'affiche qu'il visait, et
 * deux affiches dont l'une s'appelle exactement comme la saisie ne se
 * départagent pas au hasard.
 */
export function findPosterChoiceByName(choices: PosterChoice[], name: string): PosterChoice | null {
  const needle = fold(name ?? "");

  if (needle.length === 0) {
    return null;
  }

  return choices.find((choice) => fold(choice.name) === needle) ?? matchPosterChoices(choices, name, 1)[0] ?? null;
}
