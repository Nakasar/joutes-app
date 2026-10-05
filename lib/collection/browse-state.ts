import { readChoice, readPage, writePage } from "@/lib/navigation/url-query";

export type CardOwnershipFilter = "all" | "owned" | "unowned";

/** Ce que montre la collection d'un jeu : la saisie, les filtres et la page. */
export type CollectionBrowseState = {
  search: string;
  setCode: string;
  type: string;
  ownership: CardOwnershipFilter;
  page: number;
};

const OWNERSHIPS = ["all", "owned", "unowned"] as const satisfies readonly CardOwnershipFilter[];

/** L'état de la collection relu depuis l'adresse ; sans paramètre, tout est ouvert. */
export function readCollectionBrowseState(params: URLSearchParams): CollectionBrowseState {
  return {
    search: params.get("search") ?? "",
    setCode: params.get("setCode") || "all",
    type: params.get("type") || "all",
    ownership: readChoice(params, "owned", OWNERSHIPS, "all"),
    page: readPage(params),
  };
}

/** L'état de la collection réécrit en adresse : seul ce qui s'écarte du défaut y figure. */
export function writeCollectionBrowseState(state: CollectionBrowseState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.search.trim()) params.set("search", state.search.trim());
  if (state.setCode !== "all") params.set("setCode", state.setCode);
  if (state.type !== "all") params.set("type", state.type);
  if (state.ownership !== "all") params.set("owned", state.ownership);
  writePage(params, state.page);

  return params;
}

/** L'état de la collection traduit en options de `getGameCollection`, pour le rendu serveur. */
export function gameCollectionQuery(state: CollectionBrowseState) {
  return {
    search: state.search.trim() || undefined,
    setCode: state.setCode !== "all" ? state.setCode : undefined,
    type: state.type !== "all" ? state.type : undefined,
    owned: state.ownership === "all" ? undefined : state.ownership === "owned",
    page: state.page,
  };
}
