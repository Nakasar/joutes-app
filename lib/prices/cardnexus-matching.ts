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
};

/**
 * Jeux dont une extension au moins ne se retrouve pas par son code. Un jeu
 * absent s'importe quand même : ses codes sont pris tels quels, et le bilan de
 * l'import dit lesquels n'ont rien trouvé en face.
 */
export const CARDNEXUS_GAME_PROFILES: Record<string, CardnexusGameProfile> = {};

/** Les codes d'extension se comparent sans casse ni ponctuation. */
export function normalizeSetCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Les numéros de collection se comparent sans ponctuation, sans casse et sans
 * zéros de tête : un catalogue écrit `027a` là où l'autre écrit `27a`, et les
 * deux désignent la variante du numéro 27.
 */
export function normalizePrintNumber(printNumber: string): string {
  return printNumber
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/0*(\d+)/g, "$1");
}

/** Clé d'identité d'une carte : son extension et son numéro. */
function identityKey(setCode: string, printNumber: string): string {
  return `${normalizeSetCode(setCode)}|${normalizePrintNumber(printNumber)}`;
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
    const key = identityKey(card.setCode, card.collectorNumber);
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

    const candidates = cardsByIdentity.get(identityKey(setCode, product.printNumber)) ?? [];

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
