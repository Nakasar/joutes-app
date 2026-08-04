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
  // Statistiques secondaires du preset, dans l'ordre des colonnes demandées.
  stats?: (number | string)[];
  // Temps de résolution du puzzle, déjà formaté (mm:ss). Vide hors phase
  // puzzle, ou tant que le joueur n'a pas terminé.
  puzzleTime?: string;
};

export type StandingsCsvLabels = {
  rank: string;
  player: string;
  points: string;
  record: string;
  opponentMatchWin: string;
  gameWin: string;
  status: string;
  time: string;
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

/**
 * Classement au format CSV. `statLabels` insère les colonnes de statistiques du
 * preset entre le bilan et les pourcentages de départage, dans le même ordre
 * que le tableau à l'écran : le fichier doit se relire comme la page. La
 * colonne du chronomètre n'apparaît que si un temps a été relevé (phase
 * puzzle) — ailleurs, elle serait vide sur toute la hauteur.
 */
export function buildStandingsCsv(
  entries: StandingsExportEntry[],
  labels: StandingsCsvLabels,
  statLabels: string[] = []
): string {
  const withTime = entries.some((entry) => entry.puzzleTime);
  const header = [
    labels.rank,
    labels.player,
    ...(withTime ? [labels.time] : []),
    labels.points,
    labels.record,
    ...statLabels,
    labels.opponentMatchWin,
    labels.gameWin,
    labels.status,
  ];
  const rows = entries.map((entry) => [
    entry.rank,
    entry.name,
    ...(withTime ? [entry.puzzleTime ?? ""] : []),
    entry.matchPoints,
    `${entry.wins}-${entry.losses}-${entry.draws}`,
    ...statLabels.map((_, index) => entry.stats?.[index] ?? 0),
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
