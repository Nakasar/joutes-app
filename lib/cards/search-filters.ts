/**
 * Filtres et tri de l'exploration des cartes, dérivés des attributs que porte
 * réellement le jeu : plages pour les attributs numériques (énergie, puissance,
 * might…), listes de valeurs pour les autres (domaines, raretés…).
 *
 * Rien n'est construit à partir de ce que l'appelant envoie : un paramètre dont
 * la clé n'est pas une facette connue du jeu est ignoré, et les valeurs sont
 * échappées. Une expression de filtre Meilisearch est du texte — y recopier une
 * saisie telle quelle laisserait réécrire la requête.
 */

export type CardNumericFacet = {
  key: string;
  type: "number";
  min: number;
  max: number;
};

export type CardValueFacet = {
  key: string;
  type: "value";
  values: string[];
};

export type CardFilterFacet = CardNumericFacet | CardValueFacet;

export type CardSortDirection = "asc" | "desc";

export type CardSearchCriteria = {
  /** Bornes par attribut numérique ; une borne absente ne restreint pas ce côté. */
  ranges: Record<string, { min?: number; max?: number }>;
  /** Valeurs retenues par attribut ; plusieurs valeurs d'un même attribut s'entendent comme un « ou ». */
  values: Record<string, string[]>;
  sort?: { key: string; direction: CardSortDirection };
};

/** Clés de tri qui ne viennent pas d'un attribut de jeu. */
export const CORE_SORT_KEYS = ["name", "collectorNumber"] as const;
export type CoreSortKey = (typeof CORE_SORT_KEYS)[number];

export const EMPTY_CRITERIA: CardSearchCriteria = { ranges: {}, values: {} };

/** Préfixes des paramètres d'URL, pour que les filtres n'empiètent pas sur les autres. */
const RANGE_MIN_PREFIX = "min_";
const RANGE_MAX_PREFIX = "max_";
const VALUES_PREFIX = "in_";
const SORT_PARAM = "sort";

function numericFacets(facets: CardFilterFacet[]): Map<string, CardNumericFacet> {
  return new Map(facets.flatMap((facet) => (facet.type === "number" ? [[facet.key, facet]] : [])));
}

function valueFacets(facets: CardFilterFacet[]): Map<string, CardValueFacet> {
  return new Map(facets.flatMap((facet) => (facet.type === "value" ? [[facet.key, facet]] : [])));
}

/** Clés de tri acceptées : les champs communs, plus tout attribut numérique du jeu. */
export function sortableKeys(facets: CardFilterFacet[]): string[] {
  return [...CORE_SORT_KEYS, ...[...numericFacets(facets).keys()]];
}

/**
 * Critères tirés des paramètres de la requête. Une clé inconnue du jeu, une
 * borne qui n'est pas un nombre ou une valeur absente de la facette sont
 * ignorées : les critères qui en sortent ne portent que du connu.
 */
export function parseCardSearchCriteria(
  params: URLSearchParams,
  facets: CardFilterFacet[]
): CardSearchCriteria {
  const numbers = numericFacets(facets);
  const lists = valueFacets(facets);

  const ranges: CardSearchCriteria["ranges"] = {};
  const values: CardSearchCriteria["values"] = {};

  for (const [param, raw] of params.entries()) {
    if (param.startsWith(RANGE_MIN_PREFIX) || param.startsWith(RANGE_MAX_PREFIX)) {
      const bound = param.startsWith(RANGE_MIN_PREFIX) ? "min" : "max";
      const key = param.slice(bound === "min" ? RANGE_MIN_PREFIX.length : RANGE_MAX_PREFIX.length);
      if (!numbers.has(key)) continue;

      const parsed = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(parsed)) continue;

      ranges[key] = { ...ranges[key], [bound]: parsed };
      continue;
    }

    if (param.startsWith(VALUES_PREFIX)) {
      const key = param.slice(VALUES_PREFIX.length);
      const facet = lists.get(key);
      if (!facet) continue;

      // Seules les valeurs que le jeu porte vraiment sont retenues.
      const allowed = new Set(facet.values);
      const kept = [...new Set(raw.split(",").map((value) => value.trim()).filter((value) => allowed.has(value)))];
      if (kept.length > 0) {
        values[key] = [...(values[key] ?? []), ...kept];
      }
    }
  }

  // Une plage inversée (min > max) ne renverrait rien : les bornes sont remises
  // dans l'ordre plutôt que de rendre une liste vide sans explication.
  for (const range of Object.values(ranges)) {
    if (range.min !== undefined && range.max !== undefined && range.min > range.max) {
      [range.min, range.max] = [range.max, range.min];
    }
  }

  return { ranges, values, sort: parseSort(params.get(SORT_PARAM), facets) };
}

function parseSort(raw: string | null, facets: CardFilterFacet[]): CardSearchCriteria["sort"] {
  if (!raw) return undefined;

  const [key, direction = "asc"] = raw.split(":");
  if (!sortableKeys(facets).includes(key)) return undefined;
  if (direction !== "asc" && direction !== "desc") return undefined;

  return { key, direction };
}

/** Valeur littérale d'une expression Meilisearch : guillemets et antislashs échappés. */
/**
 * Une valeur dans une expression de filtre Meilisearch : entre guillemets et
 * échappée. Sans ça, une valeur à espaces — `Battlefield Rune` — casse
 * l'expression, et une valeur à guillemets la réécrit.
 */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Expressions de filtre Meilisearch pour les critères. Les valeurs d'un même
 * attribut s'entendent comme un « ou », les attributs entre eux comme un « et ».
 */
export function buildFacetFilters(criteria: CardSearchCriteria, facets: CardFilterFacet[]): string[] {
  const numbers = numericFacets(facets);
  const lists = valueFacets(facets);
  const filters: string[] = [];

  for (const [key, range] of Object.entries(criteria.ranges)) {
    if (!numbers.has(key)) continue;
    if (range.min !== undefined) filters.push(`${key} >= ${range.min}`);
    if (range.max !== undefined) filters.push(`${key} <= ${range.max}`);
  }

  for (const [key, kept] of Object.entries(criteria.values)) {
    if (!lists.has(key) || kept.length === 0) continue;
    filters.push(`${key} IN [${kept.map(quoteFilterValue).join(", ")}]`);
  }

  return filters;
}

/**
 * Tri Meilisearch. Les champs communs peuvent porter un autre nom dans l'index
 * que dans la base — le numéro de collection s'appelle `collector_number` chez
 * Magic — d'où la correspondance passée par l'appelant.
 */
export function buildSortExpressions(
  criteria: CardSearchCriteria,
  indexKeys: { collectorNumber: string }
): string[] {
  if (!criteria.sort) return [];

  const field = criteria.sort.key === "collectorNumber" ? indexKeys.collectorNumber : criteria.sort.key;
  return [`${field}:${criteria.sort.direction}`];
}

/** Critères réécrits en paramètres d'URL, pour que la recherche reste partageable. */
export function serializeCardSearchCriteria(criteria: CardSearchCriteria): [string, string][] {
  const params: [string, string][] = [];

  for (const [key, range] of Object.entries(criteria.ranges)) {
    if (range.min !== undefined) params.push([`${RANGE_MIN_PREFIX}${key}`, String(range.min)]);
    if (range.max !== undefined) params.push([`${RANGE_MAX_PREFIX}${key}`, String(range.max)]);
  }

  for (const [key, values] of Object.entries(criteria.values)) {
    if (values.length > 0) params.push([`${VALUES_PREFIX}${key}`, values.join(",")]);
  }

  if (criteria.sort) {
    params.push([SORT_PARAM, `${criteria.sort.key}:${criteria.sort.direction}`]);
  }

  return params;
}

/**
 * Borne d'un attribut numérique, telle que la saisit un champ de formulaire :
 * une saisie vide ou illisible retire la borne plutôt que d'en poser une
 * fantaisiste, et un attribut sans plus aucune borne quitte les critères.
 */
export function withRangeBound(
  criteria: CardSearchCriteria,
  key: string,
  bound: "min" | "max",
  raw: string
): CardSearchCriteria {
  const parsed = Number(raw);
  const ranges = { ...criteria.ranges };
  const range = { ...ranges[key] };

  if (raw.trim() === "" || !Number.isFinite(parsed)) {
    delete range[bound];
  } else {
    range[bound] = parsed;
  }

  if (range.min === undefined && range.max === undefined) {
    delete ranges[key];
  } else {
    ranges[key] = range;
  }

  return { ...criteria, ranges };
}

/** Retire les deux bornes d'un attribut d'un coup — la pastille qu'on enlève. */
export function withoutRange(criteria: CardSearchCriteria, key: string): CardSearchCriteria {
  const ranges = { ...criteria.ranges };
  delete ranges[key];
  return { ...criteria, ranges };
}

/** Coche ou décoche une valeur ; un attribut sans plus aucune valeur disparaît. */
export function withToggledValue(
  criteria: CardSearchCriteria,
  key: string,
  value: string
): CardSearchCriteria {
  const current = criteria.values[key] ?? [];
  const kept = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  const values = { ...criteria.values };

  if (kept.length > 0) {
    values[key] = kept;
  } else {
    delete values[key];
  }

  return { ...criteria, values };
}

/** Vide les filtres d'attributs. Le tri n'en est pas un : il reste en place. */
export function withoutFacetFilters(criteria: CardSearchCriteria): CardSearchCriteria {
  return { ...criteria, ranges: {}, values: {} };
}

/** Y a-t-il au moins un filtre d'attribut actif ? Sert à annoncer les filtres repliés. */
export function countActiveFacetFilters(criteria: CardSearchCriteria): number {
  const ranges = Object.values(criteria.ranges).filter(
    (range) => range.min !== undefined || range.max !== undefined
  ).length;
  const values = Object.values(criteria.values).filter((list) => list.length > 0).length;

  return ranges + values;
}
