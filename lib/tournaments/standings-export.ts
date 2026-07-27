import { buildCsvDocument } from "@/lib/tournaments/match-export";

// Une ligne de classement telle qu'exportée. Volontairement découplée du type
// du domaine : l'export ne dépend que des colonnes qu'il affiche.
export type StandingsExportEntry = {
  rank: number;
  name: string;
  matchPoints: number;
  wins: number;
  losses: number;
  draws: number;
  // Pourcentages déjà formatés (ex : « 72,4 % ») ou vides s'ils ne sont pas
  // calculables (aucun adversaire joué).
  opponentMatchWin: string;
  gameWin: string;
  status: string;
};

export type StandingsCsvLabels = {
  rank: string;
  player: string;
  points: string;
  record: string;
  opponentMatchWin: string;
  gameWin: string;
  status: string;
};

/**
 * Pourcentage de parties gagnées d'un joueur. Renvoie null quand aucune partie
 * n'a été jouée : un « 0 % » laisserait croire à une contre-performance là où
 * l'information n'existe simplement pas encore.
 */
export function gameWinPercentage(gamesWon: number, gamesLost: number): number | null {
  const played = gamesWon + gamesLost;
  if (played <= 0) return null;
  return (gamesWon / played) * 100;
}

/** Formate un pourcentage de départage avec une décimale, ou « — » si absent. */
export function formatTiebreaker(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
}

export function buildStandingsCsv(
  entries: StandingsExportEntry[],
  labels: StandingsCsvLabels
): string {
  const header = [
    labels.rank,
    labels.player,
    labels.points,
    labels.record,
    labels.opponentMatchWin,
    labels.gameWin,
    labels.status,
  ];
  const rows = entries.map((entry) => [
    entry.rank,
    entry.name,
    entry.matchPoints,
    `${entry.wins}-${entry.losses}-${entry.draws}`,
    entry.opponentMatchWin,
    entry.gameWin,
    entry.status,
  ]);
  return buildCsvDocument([header, ...rows]);
}

/** Nom de fichier sûr, dérivé du nom du tournoi. */
export function buildStandingsCsvFileName(tournamentName: string, roundNumber?: number): string {
  const slug = tournamentName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  const base = slug || "tournoi";
  return roundNumber ? `${base}-ronde-${roundNumber}-classement.csv` : `${base}-classement.csv`;
}
