import type { CardnexusExpansion, CardnexusProduct } from "@/lib/prices/cardnexus";
import type { PriceableCard } from "@/lib/types/card-price";

/**
 * Rapprochement des produits CardNexus et des cartes de la plateforme.
 *
 * Rien à deviner ici, contrairement à Cardmarket : le catalogue CardNexus donne
 * de chaque produit son extension — nommée, et portant le code de l'éditeur —
 * et son numéro de collection. Une carte et un produit sont la même carte quand
 * ils portent le même code d'extension et le même numéro. C'est une identité,
 * pas une ressemblance : ni seuil, ni score, ni appariement dans l'ordre.
 *
 * Ce qui reste à traduire tient en deux détails d'écriture : les codes se
 * comparent sans casse ni ponctuation, et les numéros sans leurs zéros de tête
 * (`027a` et `27a` sont le même numéro). Quand un code diffère franchement des
 * deux côtés, le profil du jeu le dit — c'est une table, pas une heuristique.
 *
 * Cf. docs/CARD_PRICES.md.
 */

/**
 * Ce qu'il faut savoir d'un jeu pour retrouver ses extensions chez CardNexus.
 * Vide pour la plupart : les deux catalogues tiennent leur code de l'éditeur.
 */
export type CardnexusGameProfile = {
  /** Codes CardNexus qui s'écrivent autrement chez nous, code CardNexus en clé. */
  setCodes?: Record<string, string>;
  /** Extensions dont CardNexus ne publie pas le code, retrouvées par leur slug. */
  setCodesBySlug?: Record<string, string>;
  /**
   * Fins de numéro qui désignent le même tirage des deux côtés sans s'écrire
   * pareil, suffixe canonique en valeur. Appliquées **aux deux catalogues** :
   * elles ramènent une même variante à une même écriture, d'où qu'elle vienne.
   *
   * Un suffixe est une lettre de tirage, pas une décoration : le retirer
   * confondrait la variante avec la carte dont elle est tirée. C'est pourquoi
   * ces réécritures sont propres à un jeu — `s` et `★` sont deux tirages
   * distincts chez Magic (l'un tamponné en avant-première, l'autre non), là où
   * chez Riftbound `*` et `s` sont deux façons d'écrire le seul tirage signé.
   */
  printNumberSuffixes?: Record<string, string>;
};

/**
 * Jeux dont une extension ou un suffixe au moins ne se retrouve pas tel quel.
 * Un jeu absent s'importe quand même : ses codes et ses numéros sont pris tels
 * quels, et le bilan de l'import dit lesquels n'ont rien trouvé en face.
 */
export const CARDNEXUS_GAME_PROFILES: Record<string, CardnexusGameProfile> = {
  /**
   * Magic numérote d'une étoile noire le tirage foil des anciens jeux de base :
   * `222★` est le `222` foil. Les deux catalogues l'écrivent pareil ; c'est la
   * normalisation qui l'effaçait, faute d'être une lettre latine. Le rendre
   * lisible suffit à le distinguer.
   *
   * L'étoile n'est pas le `s` de Magic, qui marque un tout autre tirage — celui
   * tamponné en avant-première —, et les deux se rencontrent sur une même carte
   * (`123s★`) : les confondre donnerait le prix de l'un pour l'autre.
   */
  mtg: { printNumberSuffixes: { "★": "star" } },

  /**
   * Riftbound marque d'une étoile le tirage signé d'une carte : `299*` est le
   * `299` signé. CardNexus le nomme `299s` sur les extensions d'origine et
   * `299*` sur les suivantes — les deux écritures pour le même tirage, jusque
   * dans son propre catalogue. Sans cette table, l'étoile tombait à la
   * normalisation : le tirage signé se confondait avec sa carte de base, et les
   * deux étaient écartés comme indépartageables.
   */
  riftbound: { printNumberSuffixes: { "*": "s" } },
};

/** Les codes d'extension se comparent sans casse ni ponctuation. */
export function normalizeSetCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Les numéros de collection se comparent sans ponctuation, sans casse et sans
 * zéros de tête : un catalogue écrit `027a` là où l'autre écrit `27a`, et les
 * deux désignent la variante du numéro 27.
 *
 * La lettre de tirage, elle, est gardée : `27a` n'est pas `27`. Quand un jeu
 * l'écrit autrement d'un catalogue à l'autre, `suffixes` la ramène à une seule
 * écriture — c'est la seule ponctuation qui survive à la normalisation, et
 * seulement pour les jeux qui la déclarent (cf. `CardnexusGameProfile`).
 */
export function normalizePrintNumber(printNumber: string, suffixes: Record<string, string> = {}): string {
  const trimmed = printNumber.trim();

  // Une seule réécriture, jamais en chaîne : le suffixe canonique de l'une ne
  // doit pas se faire relire comme le suffixe écrit d'une autre.
  const written = Object.keys(suffixes).find((suffix) => suffix.length > 0 && trimmed.endsWith(suffix));
  const canonical = written ? `${trimmed.slice(0, -written.length)}${suffixes[written]}` : trimmed;

  return canonical
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/0*(\d+)/g, "$1");
}

/** Clé d'identité d'une carte : son extension et son numéro. */
function identityKey(setCode: string, printNumber: string, suffixes: Record<string, string>): string {
  return `${normalizeSetCode(setCode)}|${normalizePrintNumber(printNumber, suffixes)}`;
}

/** Ce qu'une extension CardNexus a donné, pour que l'import reste vérifiable. */
export type CardnexusExpansionReport = {
  id: number;
  name: string;
  /** Code retenu — celui de CardNexus, ou celui que le profil lui substitue. */
  setCode?: string;
  /** Cartes du feed dans cette extension. */
  products: number;
  /** Celles qui ont trouvé une carte de la plateforme. */
  matched: number;
};

export type CardnexusMatchReport = {
  /** Produits CardNexus retenus, par identifiant de carte. */
  matches: Map<string, CardnexusProduct[]>;
  expansions: CardnexusExpansionReport[];
  skipped: {
    /** Produit scellé : un booster n'est pas une carte du catalogue. */
    sealed: number;
    /** L'extension du produit n'a pas de code, ou aucune des nôtres ne le porte. */
    unknownExpansion: number;
    /** Le produit n'a pas de numéro de collection : rien à rapprocher. */
    noPrintNumber: number;
    /** Aucune carte de l'extension ne porte ce numéro. */
    unknownCard: number;
    /** Deux cartes de la plateforme portent ce numéro : aucune n'est choisie. */
    ambiguous: number;
  };
};

/**
 * Produits CardNexus rapprochés des cartes de la plateforme.
 *
 * Plusieurs produits peuvent tomber sur la même carte — CardNexus sépare
 * parfois les variantes d'un numéro en produits distincts — et ils lui sont
 * alors tous rattachés, à charge pour l'appelant d'en tirer un prix de
 * référence. L'inverse, deux cartes pour un numéro, n'a pas de réponse : leur
 * donner le même prix reviendrait à en inventer un, elles sont écartées.
 */
export function matchCardnexusProducts(
  products: Iterable<CardnexusProduct>,
  expansions: Iterable<CardnexusExpansion>,
  cards: PriceableCard[],
  profile: CardnexusGameProfile = {}
): CardnexusMatchReport {
  const suffixes = profile.printNumberSuffixes ?? {};

  const expansionById = new Map<number, CardnexusExpansion>();
  for (const expansion of expansions) {
    expansionById.set(expansion.id, expansion);
  }

  const setCodeOf = (expansion: CardnexusExpansion): string | undefined => {
    const aliased = expansion.code ? profile.setCodes?.[expansion.code] : undefined;
    return aliased ?? profile.setCodesBySlug?.[expansion.slug] ?? expansion.code ?? undefined;
  };

  // Une carte par (extension, numéro) : celles qui partagent le leur ne sont
  // pas départageables, et sont retirées des deux côtés.
  const cardsByIdentity = new Map<string, PriceableCard[]>();
  for (const card of cards) {
    if (!card.setCode || !card.collectorNumber) {
      continue;
    }
    const key = identityKey(card.setCode, card.collectorNumber, suffixes);
    cardsByIdentity.set(key, [...(cardsByIdentity.get(key) ?? []), card]);
  }

  const matches = new Map<string, CardnexusProduct[]>();
  const skipped = { sealed: 0, unknownExpansion: 0, noPrintNumber: 0, unknownCard: 0, ambiguous: 0 };
  const reports = new Map<number, CardnexusExpansionReport>();

  for (const product of products) {
    if (product.productType !== "card") {
      skipped.sealed++;
      continue;
    }

    const expansion = product.expansionId === null ? undefined : expansionById.get(product.expansionId);
    const setCode = expansion && setCodeOf(expansion);

    if (expansion) {
      const report = reports.get(expansion.id) ?? {
        id: expansion.id,
        name: expansion.name,
        ...(setCode ? { setCode } : {}),
        products: 0,
        matched: 0,
      };
      report.products++;
      reports.set(expansion.id, report);
    }

    if (!setCode) {
      skipped.unknownExpansion++;
      continue;
    }

    if (!product.printNumber) {
      skipped.noPrintNumber++;
      continue;
    }

    const candidates = cardsByIdentity.get(identityKey(setCode, product.printNumber, suffixes)) ?? [];

    if (candidates.length === 0) {
      skipped.unknownCard++;
      continue;
    }

    if (candidates.length > 1) {
      skipped.ambiguous++;
      continue;
    }

    matches.set(candidates[0].id, [...(matches.get(candidates[0].id) ?? []), product]);

    if (expansion) {
      reports.get(expansion.id)!.matched++;
    }
  }

  return {
    matches,
    expansions: [...reports.values()].sort((a, b) => b.products - a.products || a.id - b.id),
    skipped,
  };
}
