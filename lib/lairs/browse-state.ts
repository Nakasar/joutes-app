import { readPage, writePage } from "@/lib/navigation/url-query";

export type LairsFiltersValues = {
  search: string;
  gameId: string;
  nearLocation?: {
    longitude: number;
    latitude: number;
    maxDistanceKm: number;
  };
};

/** Ce que montre la liste des lieux : la recherche, les filtres et la page. */
export type LairsBrowseState = {
  filters: LairsFiltersValues;
  page: number;
};

const DEFAULT_DISTANCE_KM = 50;

/**
 * L'état de la liste relu depuis l'adresse. La position est gardée telle
 * quelle (`near=lat,lng`) : revenir d'une fiche ne redemande pas l'accès à la
 * géolocalisation.
 */
export function readLairsBrowseState(params: URLSearchParams): LairsBrowseState {
  return {
    filters: {
      search: params.get("search") ?? "",
      gameId: params.get("gameId") || "all",
      nearLocation: readNear(params),
    },
    page: readPage(params),
  };
}

function readNear(params: URLSearchParams): LairsFiltersValues["nearLocation"] {
  const [lat, lng] = (params.get("near") ?? "").split(",").map((part) => Number.parseFloat(part));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;

  const km = Number.parseInt(params.get("km") ?? "", 10);
  return {
    latitude: lat,
    longitude: lng,
    maxDistanceKm: Number.isFinite(km) && km > 0 ? km : DEFAULT_DISTANCE_KM,
  };
}

/** L'état de la liste réécrit en adresse : seul ce qui s'écarte du défaut y figure. */
export function writeLairsBrowseState(state: LairsBrowseState): URLSearchParams {
  const params = new URLSearchParams();
  const { search, gameId, nearLocation } = state.filters;

  if (search.trim()) params.set("search", search.trim());
  if (gameId !== "all") params.set("gameId", gameId);
  if (nearLocation) {
    // Cinq décimales : le mètre près, sans traîner toute la précision du GPS.
    params.set("near", `${nearLocation.latitude.toFixed(5)},${nearLocation.longitude.toFixed(5)}`);
    params.set("km", String(nearLocation.maxDistanceKm));
  }
  writePage(params, state.page);

  return params;
}
