export type LibrarySort = "popular" | "recent" | "favorites";

export type LibraryFilters = {
  search: string;
  /** `all` = tous les jeux. */
  gameId: string;
  /** `all` = tous les formats. */
  format: string;
  legendCardId: string;
  domains: string[];
  sort: LibrarySort;
  favoritesOnly: boolean;
};

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  search: "",
  gameId: "all",
  format: "all",
  legendCardId: "",
  domains: [],
  sort: "popular",
  favoritesOnly: false,
};

/**
 * Les filtres de la librairie, dans la forme unique que partagent l'URL, la
 * requête d'API et le rendu serveur de la première page.
 *
 * Une seule fonction pour les trois : c'est ce qui garantit qu'un lien collé
 * dans une conversation ouvre exactement les résultats que son auteur avait
 * sous les yeux.
 */
export function buildLibraryParams(filters: LibraryFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.gameId !== "all") params.set("gameId", filters.gameId);
  if (filters.format !== "all") params.set("format", filters.format);
  if (filters.legendCardId) params.set("legendCardId", filters.legendCardId);
  for (const domain of filters.domains) params.append("domain", domain);
  if (filters.sort !== "popular") params.set("sort", filters.sort);
  if (filters.favoritesOnly) params.set("favoritesOnly", "true");

  return params;
}

/** Relit les filtres depuis les paramètres d'URL, en retombant sur les valeurs vides. */
export function parseLibraryParams(params: URLSearchParams | Record<string, string | string[] | undefined>): LibraryFilters {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const getAll = (key: string): string[] => {
    if (params instanceof URLSearchParams) return params.getAll(key);
    const value = params[key];
    return Array.isArray(value) ? value : value ? [value] : [];
  };

  const sort = get("sort");

  return {
    search: get("search") ?? "",
    gameId: get("gameId") ?? "all",
    format: get("format") ?? "all",
    legendCardId: get("legendCardId") ?? "",
    domains: getAll("domain"),
    sort: sort === "recent" || sort === "favorites" ? sort : "popular",
    favoritesOnly: get("favoritesOnly") === "true" || sort === "favorites",
  };
}

/** Le tri de la librairie, traduit en critère de recherche de la base. */
export function librarySortOptions(sort: LibrarySort): {
  sortBy: "updatedAt" | "favoritesCount";
  favoritesOnly: boolean;
} {
  switch (sort) {
    case "recent":
      return { sortBy: "updatedAt", favoritesOnly: false };
    case "favorites":
      // « Mes favoris » n'est pas un tri mais un filtre ; l'ordre reste celui
      // de la fraîcheur, qui est ce qu'on attend d'une liste personnelle.
      return { sortBy: "updatedAt", favoritesOnly: true };
    case "popular":
      return { sortBy: "favoritesCount", favoritesOnly: false };
  }
}
