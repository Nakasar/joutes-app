import type { CardFilterFacet, CardSearchCriteria } from "@/lib/cards/search-filters";
import {
  buildSearchFields,
  mergeSearchCriteria,
  parseSearchSyntax,
  type ParsedSearch,
  type SearchField,
} from "@/lib/cards/search-syntax";
import type { CardCondition } from "@/lib/schemas/collection.schema";
import { cardSearchFilter } from "@/lib/collection/search";

/**
 * Recherche dans la collection, avec la syntaxe de la galerie de cartes.
 *
 * La galerie cherche dans Meilisearch, la collection dans Mongo : le texte tapé
 * est lu par le même analyseur (`lib/cards/search-syntax.ts`), puis traduit ici
 * en filtres Mongo. `domain:fury energy<=3 set:OGN` donne donc les mêmes cartes
 * dans les deux écrans, et la collection y ajoute ce qu'elle seule connaît : le
 * nombre d'exemplaires possédés (`owned`), et ce qui distingue deux exemplaires
 * d'une même carte (`foil`, `cond`, `lang`).
 */

/** Champ du nombre d'exemplaires possédés : `owned>=1`, `owned=0`, `owned<3`. */
export const OWNED_FIELD = "owned";
/** Exemplaires foil ou non : `foil:yes`, `foil:no`. */
export const FOIL_FIELD = "foil";
/** État des exemplaires : `cond:nm`. */
export const CONDITION_FIELD = "cond";

/** Écritures courtes des états, dans l'ordre du pire au meilleur. */
export const CONDITION_CODES: Record<string, CardCondition> = {
  damaged: "Damaged",
  played: "Played",
  good: "Good",
  nm: "Near Mint",
  mint: "Mint",
};

const FOIL_VALUES = ["yes", "no"];

/**
 * Plafond proposé par les suggestions d'`owned`. Ce n'est pas une limite : un
 * `owned>12` se tape très bien, il n'est simplement pas suggéré.
 */
const OWNED_SUGGESTION_MAX = 4;

/** Les champs propres à la collection, en plus de ceux du jeu. */
export function collectionExtraFields(): SearchField[] {
  return [
    { key: OWNED_FIELD, kind: "number", min: 0, max: OWNED_SUGGESTION_MAX },
    { key: FOIL_FIELD, kind: "value", values: FOIL_VALUES },
    { key: CONDITION_FIELD, kind: "value", values: Object.keys(CONDITION_CODES) },
  ];
}

/** Le vocabulaire de la barre de recherche de la collection. */
export function collectionSearchFields(
  facets: CardFilterFacet[],
  values: { setCodes?: string[]; types?: string[]; languages?: string[] } = {}
): SearchField[] {
  return buildSearchFields(facets, values, collectionExtraFields());
}

export type OwnedRange = { min?: number; max?: number };

/** Ce que la recherche demande, prêt à être appliqué au catalogue et aux exemplaires. */
export type CollectionQuery = {
  /** Filtre sur le catalogue (`cards`) : nom, extension, type, attributs du jeu. */
  cardMatch: Record<string, unknown>;
  /**
   * Filtre sur les exemplaires (`collection-cards`), ou `null` s'il n'y en a
   * pas : seuls les exemplaires qui y répondent sont comptés.
   */
  copyMatch: Record<string, unknown> | null;
  /** Bornes du nombre d'exemplaires comptés, absentes s'il n'y en a pas. */
  owned?: OwnedRange;
  /** Extension demandée, pour afficher sa complétion. */
  setCode?: string;
};

function rangeMatch(range: { min?: number; max?: number }): Record<string, number> | null {
  const bounds: Record<string, number> = {};
  if (range.min !== undefined) bounds.$gte = range.min;
  if (range.max !== undefined) bounds.$lte = range.max;
  return Object.keys(bounds).length > 0 ? bounds : null;
}

/** Deux bornes se cumulent : la plus restrictive gagne. */
export function intersectOwned(a: OwnedRange | undefined, b: OwnedRange | undefined): OwnedRange | undefined {
  if (!a) return b;
  if (!b) return a;
  const mins = [a.min, b.min].filter((value): value is number => value !== undefined);
  const maxs = [a.max, b.max].filter((value): value is number => value !== undefined);
  return {
    ...(mins.length > 0 ? { min: Math.max(...mins) } : {}),
    ...(maxs.length > 0 ? { max: Math.min(...maxs) } : {}),
  };
}

/**
 * Traduit une recherche lue en filtres Mongo.
 *
 * `criteria` porte les filtres du panneau (les mêmes `in_*`, `min_*`, `max_*`
 * que la galerie) ; ils se cumulent avec ceux de la saisie. Une clé qui n'est
 * pas une facette du jeu n'arrive pas jusqu'ici : `parseCardSearchCriteria` et
 * l'analyseur de la saisie les écartent.
 */
export function buildCollectionQuery(
  parsed: ParsedSearch,
  facets: CardFilterFacet[],
  criteria: CardSearchCriteria = { ranges: {}, values: {} }
): CollectionQuery {
  const merged = mergeSearchCriteria(criteria, parsed.criteria);
  const facetKeys = new Set(facets.map((facet) => facet.key));

  const clauses: Record<string, unknown>[] = [];
  const text = cardSearchFilter(parsed.text);
  if (text) clauses.push(text);
  if (parsed.setCode) clauses.push({ setCode: parsed.setCode });
  if (parsed.type) clauses.push({ type: parsed.type });

  for (const [key, range] of Object.entries(merged.ranges)) {
    if (!facetKeys.has(key)) continue;
    const bounds = rangeMatch(range);
    if (bounds) clauses.push({ [key]: bounds });
  }
  for (const [key, list] of Object.entries(merged.values)) {
    if (!facetKeys.has(key) || list.length === 0) continue;
    // `$in` vaut aussi pour un attribut à plusieurs valeurs (les domaines d'une
    // carte) : il suffit que l'une d'elles soit demandée, comme dans la galerie.
    clauses.push({ [key]: { $in: list } });
  }

  const copyClauses: Record<string, unknown>[] = [];
  const foil = parsed.criteria.values[FOIL_FIELD] ?? [];
  // Les deux à la fois ne filtrent rien.
  if (foil.length === 1) {
    copyClauses.push(foil[0] === "yes" ? { foil: true } : { foil: { $ne: true } });
  }
  const conditions = (parsed.criteria.values[CONDITION_FIELD] ?? [])
    .map((code) => CONDITION_CODES[code])
    .filter((condition): condition is CardCondition => condition !== undefined);
  if (conditions.length > 0) copyClauses.push({ condition: { $in: conditions } });
  // Dans la collection, la langue est celle de l'exemplaire : le catalogue n'a
  // souvent que la version anglaise d'une carte qu'on possède en français.
  if (parsed.lang) copyClauses.push({ language: parsed.lang.toUpperCase() });

  const copyMatch = copyClauses.length === 0 ? null : copyClauses.length === 1 ? copyClauses[0] : { $and: copyClauses };

  let owned: OwnedRange | undefined = parsed.criteria.ranges[OWNED_FIELD];
  // `foil:yes` seul veut dire « mes exemplaires foil » : une carte dont on n'a
  // aucun exemplaire foil n'a rien à faire dans le résultat.
  if (copyMatch && !owned) owned = { min: 1 };

  return {
    cardMatch: clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0] : { $and: clauses },
    copyMatch,
    ...(owned ? { owned } : {}),
    ...(parsed.setCode ? { setCode: parsed.setCode } : {}),
  };
}

/** Raccourci : lit la saisie et la traduit d'un coup. */
export function parseCollectionQuery(
  input: string,
  fields: SearchField[],
  facets: CardFilterFacet[],
  criteria?: CardSearchCriteria
): CollectionQuery {
  return buildCollectionQuery(parseSearchSyntax(input, fields), facets, criteria);
}

/** La borne d'exemplaires d'un filtre Tous / Possédées / Manquantes. */
export function ownershipRange(owned: boolean | undefined): OwnedRange | undefined {
  if (owned === undefined) return undefined;
  return owned ? { min: 1 } : { max: 0 };
}

/** Filtre Mongo sur le nombre d'exemplaires comptés, ou `null` sans borne. */
export function ownedQuantityMatch(range: OwnedRange | undefined): Record<string, number> | null {
  if (!range) return null;
  // `owned>=0` ne retire aucune carte : inutile de payer le comptage pour rien.
  const effective: OwnedRange = { ...(range.min !== undefined && range.min > 0 ? { min: range.min } : {}), ...(range.max !== undefined ? { max: range.max } : {}) };
  return effective.min === undefined && effective.max === undefined ? null : rangeMatch(effective);
}

/**
 * Applique la borne `owned` à des lots d'export : une carte est gardée si la
 * somme de ses exemplaires (tous lots confondus) est dans la borne, comme à
 * l'écran. Les cartes à zéro exemplaire n'ont pas de lot, donc `owned=0` vide l'export.
 */
export function filterGroupsByOwned<T extends { cardId: string; quantity: number }>(groups: T[], range: OwnedRange | undefined): T[] {
  if (!range) return groups;
  const totals = new Map<string, number>();
  for (const group of groups) totals.set(group.cardId, (totals.get(group.cardId) ?? 0) + group.quantity);
  return groups.filter((group) => {
    const total = totals.get(group.cardId) ?? 0;
    return (range.min === undefined || total >= range.min) && (range.max === undefined || total <= range.max);
  });
}
