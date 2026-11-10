import { groupByMonth, groupByTournament, summarizeResults, type TimelineTournament } from "@/lib/tournaments/results";
import type { TournamentResult } from "@/lib/types/TournamentResult";

/**
 * La vue Tournois d'un groupe (`?view=tournaments`), en fonctions pures : les
 * filtres lus dans l'adresse, et la timeline des membres actuels.
 *
 * Un membre apporte tout son historique, y compris d'avant son arrivée dans le
 * groupe ; un ancien membre n'apporte plus rien.
 */

type SearchParamValue = string | string[] | undefined;

function single(value: SearchParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();

  return trimmed ? trimmed : undefined;
}

export type GroupTournamentFilters = {
  gameId?: string;
  userId?: string;
  legendName?: string;
  topEight?: boolean;
  /** `2026-09` : la timeline commence à ce mois, les plus récents sont sur la page d'avant. */
  before?: string;
};

/** Mêmes clés courtes que la bibliothèque de decks : `jeu`, `membre`, `legende`, plus `top8` et `avant`. */
export function readGroupTournamentFilters(params: Record<string, SearchParamValue>): GroupTournamentFilters {
  const filters: GroupTournamentFilters = {};
  const gameId = single(params.jeu);
  const userId = single(params.membre);
  const legendName = single(params.legende);
  const before = single(params.avant);

  if (gameId) filters.gameId = gameId;
  if (userId) filters.userId = userId;
  if (legendName) filters.legendName = legendName.slice(0, 120);
  if (single(params.top8) === "1") filters.topEight = true;
  if (before && /^\d{4}-(0[1-9]|1[0-2])$/.test(before)) filters.before = before;

  return filters;
}

/** Les filtres en paramètres d'adresse, pour `viewHref`. */
export function groupTournamentFilterParams(filters: GroupTournamentFilters): Record<string, string | undefined> {
  return {
    jeu: filters.gameId,
    membre: filters.userId,
    legende: filters.legendName,
    top8: filters.topEight ? "1" : undefined,
    avant: filters.before,
  };
}

export function filterGroupResults<T extends TournamentResult>(results: T[], filters: GroupTournamentFilters): T[] {
  return results.filter(
    (result) =>
      (!filters.gameId || result.gameId === filters.gameId) &&
      (!filters.userId || result.userId === filters.userId) &&
      (!filters.legendName || result.legendName === filters.legendName) &&
      (!filters.topEight || (result.placement !== undefined && result.placement <= 8)),
  );
}

/** Le mois d'avant `2026-09` : `2026-08`. */
export function previousMonth(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return index === 1 ? `${year - 1}-12` : `${year}-${String(index - 1).padStart(2, "0")}`;
}

export type GroupTimeline<T extends TournamentResult> = {
  months: { month: string; tournaments: TimelineTournament<T>[] }[];
  /** Le mois où reprend la page suivante, s'il reste des tournois plus anciens. */
  nextBefore?: string;
  participations: number;
  tournaments: number;
  /** Le mois du plus ancien résultat, pour « depuis mars 2025 ». */
  since?: string;
};

/**
 * La timeline d'une page : des mois entiers, jusqu'à `pageSize` tournois au
 * moins (un mois n'est jamais coupé). Les totaux portent sur tous les
 * résultats filtrés, pas sur la page.
 */
export function buildGroupTimeline<T extends TournamentResult>(
  results: T[],
  filters: GroupTournamentFilters,
  pageSize = 12,
): GroupTimeline<T> {
  const filtered = filterGroupResults(results, filters);
  const all = groupByTournament(filtered);
  const months = groupByMonth(all.filter((tournament) => !filters.before || tournament.date.slice(0, 7) <= filters.before));

  const page: GroupTimeline<T>["months"] = [];
  let count = 0;
  for (const month of months) {
    if (count >= pageSize) break;
    page.push(month);
    count += month.tournaments.length;
  }
  const rest = months.slice(page.length);

  return {
    months: page,
    ...(rest.length > 0 ? { nextBefore: rest[0].month } : {}),
    participations: filtered.length,
    tournaments: all.length,
    ...(filtered.length > 0 ? { since: filtered.map((result) => result.date).sort()[0].slice(0, 7) } : {}),
  };
}

export type MemberPalmares = { userId: string } & ReturnType<typeof summarizeResults>;

/** Le palmarès de chaque membre classé, par victoires, puis top 8, puis tournois. */
export function groupPalmares(results: TournamentResult[]): MemberPalmares[] {
  const byUser = new Map<string, TournamentResult[]>();
  for (const result of results) byUser.set(result.userId, [...(byUser.get(result.userId) ?? []), result]);

  return [...byUser]
    .map(([userId, own]) => ({ userId, ...summarizeResults(own) }))
    .sort((a, b) => b.wins - a.wins || b.topEights - a.topEights || b.tournaments - a.tournaments);
}

/** Les légendes jouées par les membres, pour le filtre, de la plus jouée à la moins jouée. */
export function groupLegends(results: TournamentResult[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (result.legendName) counts.set(result.legendName, (counts.get(result.legendName) ?? 0) + 1);
  }

  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
