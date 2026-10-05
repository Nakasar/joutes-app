import type { LeagueFormat, LeagueStatus } from "@/lib/types/League";
import { readChoice, readPage, writePage } from "@/lib/navigation/url-query";

export type LeaguesFiltersValues = {
  search: string;
  format: LeagueFormat | "all";
  status: LeagueStatus | "all";
  gameId: string;
};

/** Ce que montre la liste des ligues : la recherche, les filtres et la page. */
export type LeaguesBrowseState = {
  filters: LeaguesFiltersValues;
  page: number;
};

const FORMATS = ["all", "KILLER", "POINTS"] as const satisfies readonly (LeagueFormat | "all")[];
const STATUSES = [
  "all",
  "DRAFT",
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly (LeagueStatus | "all")[];

/** L'état de la liste relu depuis l'adresse ; sans paramètre, tout est ouvert. */
export function readLeaguesBrowseState(params: URLSearchParams): LeaguesBrowseState {
  return {
    filters: {
      search: params.get("search") ?? "",
      format: readChoice(params, "format", FORMATS, "all"),
      status: readChoice(params, "status", STATUSES, "all"),
      gameId: params.get("gameId") || "all",
    },
    page: readPage(params),
  };
}

/** L'état de la liste réécrit en adresse : seul ce qui s'écarte du défaut y figure. */
export function writeLeaguesBrowseState(state: LeaguesBrowseState): URLSearchParams {
  const params = new URLSearchParams();
  const { search, format, status, gameId } = state.filters;

  if (search.trim()) params.set("search", search.trim());
  if (format !== "all") params.set("format", format);
  if (status !== "all") params.set("status", status);
  if (gameId !== "all") params.set("gameId", gameId);
  writePage(params, state.page);

  return params;
}
