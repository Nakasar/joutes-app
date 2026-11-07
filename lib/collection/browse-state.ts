import { readChoice, readPage, writePage } from "@/lib/navigation/url-query";

export type CardOwnershipFilter = "all" | "owned" | "unowned";

/**
 * Ce que montre la collection d'un jeu : la saisie, les filtres du panneau, le
 * filtre Toutes / Possédées / Manquantes et la page.
 *
 * L'extension et le type ne sont plus des listes à part : ce sont des tokens de
 * la saisie (`set:OGN`, `type:Unit`), comme dans la galerie de cartes.
 */
export type CollectionBrowseState = {
  search: string;
  /**
   * Filtres du panneau, tels qu'ils s'écrivent dans l'adresse (`in_domain`,
   * `min_energy`…). Gardés bruts ici : seul le serveur connaît les facettes du
   * jeu qui permettent de les valider.
   */
  filters: [string, string][];
  ownership: CardOwnershipFilter;
  page: number;
};

const OWNERSHIPS = ["all", "owned", "unowned"] as const satisfies readonly CardOwnershipFilter[];
const FILTER_PREFIXES = ["in_", "min_", "max_"];

function isFilterParam(key: string): boolean {
  return FILTER_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Un token de la saisie, entre guillemets si sa valeur a une espace. */
function token(field: string, value: string): string {
  return `${field}:${/\s/.test(value) ? `"${value}"` : value}`;
}

/** L'état de la collection relu depuis l'adresse ; sans paramètre, tout est ouvert. */
export function readCollectionBrowseState(params: URLSearchParams): CollectionBrowseState {
  // `setCode` et `type` sont les paramètres d'avant la syntaxe commune : un lien
  // ancien (ou celui de la page Extensions) ouvre toujours la bonne extension,
  // désormais écrite dans la saisie où on peut la retirer.
  const legacy = [
    params.get("setCode") && params.get("setCode") !== "all" ? token("set", params.get("setCode")!) : "",
    params.get("type") && params.get("type") !== "all" ? token("type", params.get("type")!) : "",
  ].filter(Boolean);
  const search = [...legacy, params.get("search") ?? ""].filter(Boolean).join(" ");

  return {
    search,
    filters: [...params.entries()].filter(([key]) => isFilterParam(key)),
    ownership: readChoice(params, "owned", OWNERSHIPS, "all"),
    page: readPage(params),
  };
}

/** L'état de la collection réécrit en adresse : seul ce qui s'écarte du défaut y figure. */
export function writeCollectionBrowseState(state: CollectionBrowseState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.search.trim()) params.set("search", state.search.trim());
  for (const [key, value] of state.filters) params.append(key, value);
  if (state.ownership !== "all") params.set("owned", state.ownership);
  writePage(params, state.page);

  return params;
}

/**
 * Les paramètres de l'API de collection pour cet état : la saisie et les
 * filtres partent tels quels, le serveur les lit avec la syntaxe commune.
 */
export function collectionApiParams(state: CollectionBrowseState, limit = 48): URLSearchParams {
  const params = new URLSearchParams({ page: String(state.page), limit: String(limit) });
  if (state.search.trim()) params.set("search", state.search.trim());
  for (const [key, value] of state.filters) params.append(key, value);
  if (state.ownership === "owned") params.set("owned", "true");
  if (state.ownership === "unowned") params.set("owned", "false");
  return params;
}

/** L'état de la collection traduit en options de `getGameCollection`, pour le rendu serveur. */
export function gameCollectionQuery(state: CollectionBrowseState) {
  return {
    owned: state.ownership === "all" ? undefined : state.ownership === "owned",
    page: state.page,
  };
}
