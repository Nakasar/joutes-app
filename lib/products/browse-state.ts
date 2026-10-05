import { ALL_EDITIONS, resolveEdition } from "@/lib/constants/product-editions";
import { PRODUCT_KIND_KEYS } from "@/lib/constants/product-kinds";
import {
  EMPTY_CRITERIA,
  parseCardSearchCriteria,
  serializeCardSearchCriteria,
  type CardFilterFacet,
  type CardSearchCriteria,
} from "@/lib/cards/search-filters";
import { readChoice, readPage, writePage } from "@/lib/navigation/url-query";

export type ProductShape = "all" | "containers" | "units";
export type ProductOwnership = "all" | "owned" | "unowned";

export type ProductFilterState = {
  setCode: string;
  kind: string;
  edition: string;
  shape: ProductShape;
  ownership: ProductOwnership;
  criteria: CardSearchCriteria;
};

export const EMPTY_PRODUCT_FILTERS: Omit<ProductFilterState, "edition"> = {
  setCode: "all",
  kind: "all",
  shape: "all",
  ownership: "all",
  criteria: EMPTY_CRITERIA,
};

/** Ce que montre un catalogue de produits : la saisie, les filtres et la page. */
export type ProductBrowseState = {
  search: string;
  filters: ProductFilterState;
  page: number;
};

const SHAPES = ["all", "containers", "units"] as const satisfies readonly ProductShape[];
const OWNERSHIPS = ["all", "owned", "unowned"] as const satisfies readonly ProductOwnership[];

/**
 * L'état du catalogue relu depuis l'adresse. Sans paramètre, c'est l'écran par
 * défaut : l'édition en cours du jeu, tout le reste ouvert.
 *
 * Les facettes du jeu bornent les critères : une clé ou une valeur inconnue est
 * écartée, comme le fait la route d'API.
 */
export function readProductBrowseState(
  params: URLSearchParams,
  { currentEdition, facets }: { currentEdition?: string; facets: CardFilterFacet[] }
): ProductBrowseState {
  const kind = params.get("kind");

  return {
    search: params.get("search") ?? "",
    filters: {
      setCode: params.get("setCode") || "all",
      kind: kind && (PRODUCT_KIND_KEYS as string[]).includes(kind) ? kind : "all",
      edition: params.get("edition") || currentEdition || ALL_EDITIONS,
      shape: readChoice(params, "shape", SHAPES, "all"),
      ownership: readChoice(params, "owned", OWNERSHIPS, "all"),
      criteria: parseCardSearchCriteria(params, facets),
    },
    page: readPage(params),
  };
}

/**
 * L'état du catalogue réécrit en adresse. Seul ce qui s'écarte de l'écran par
 * défaut y figure — l'édition en cours notamment, que le chemin implique déjà.
 */
export function writeProductBrowseState(state: ProductBrowseState, currentEdition?: string): URLSearchParams {
  const params = new URLSearchParams();
  const { search, filters } = state;

  if (search.trim()) params.set("search", search.trim());
  if (filters.setCode !== "all") params.set("setCode", filters.setCode);
  if (filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.edition !== (currentEdition || ALL_EDITIONS)) params.set("edition", filters.edition);
  if (filters.shape !== "all") params.set("shape", filters.shape);
  if (filters.ownership !== "all") params.set("owned", filters.ownership);
  for (const [key, value] of serializeCardSearchCriteria(filters.criteria)) {
    params.set(key, value);
  }
  writePage(params, state.page);

  return params;
}

/** L'état du catalogue traduit en options de `getProductCollection`, pour le rendu serveur. */
export function productCollectionQuery(state: ProductBrowseState) {
  const { search, filters } = state;

  return {
    search: search.trim() || undefined,
    setCode: filters.setCode !== "all" ? filters.setCode : undefined,
    kind: filters.kind !== "all" ? filters.kind : undefined,
    edition: resolveEdition(filters.edition, undefined),
    criteria: filters.criteria,
    owned: filters.ownership === "all" ? undefined : filters.ownership === "owned",
    containers: filters.shape === "all" ? undefined : filters.shape === "containers",
    page: state.page,
  };
}
