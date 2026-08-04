import { getPreset, presetStatKeys } from "@/lib/tournaments/game-presets";
import type {
  TournamentMatch,
  TournamentMatchStatus,
  TournamentPhase,
  TournamentPlayer,
  TournamentRound,
} from "@/lib/types/Tournament";

/**
 * Mise à plat des matchs d'un tournoi pour l'impression et l'export CSV : les
 * deux sorties partagent la même lecture des données (libellés des joueurs,
 * score du best-of, vainqueurs), pour ne pas diverger avec le temps.
 */

export type MatchExportPlayer = Pick<TournamentPlayer, "id" | "displayName" | "discriminator">;

/** `pseudo#1234` quand le discriminateur existe, sinon le seul pseudo. */
export function formatPlayerLabel(player: MatchExportPlayer | undefined, fallback: string): string {
  if (!player) return fallback;
  return player.discriminator ? `${player.displayName}#${player.discriminator}` : player.displayName;
}

export type MatchExportEntry = {
  matchId: string;
  phaseId: string;
  phaseName: string;
  roundId: string;
  roundNumber: number;
  tableNumber?: number;
  status: TournamentMatchStatus;
  /** Un seul joueur : le match est un BYE. */
  players: {
    id: string;
    label: string;
    score: number;
    isWinner: boolean;
    // Statistiques du preset cumulées sur les parties du match (score de
    // bataille, score de destruction…). Absent si la phase n'en relève pas.
    stats?: Record<string, number>;
  }[];
  winners: string[];
  /** Score du best-of, dans l'ordre des joueurs (ex. « 2 - 1 »). */
  score: string;
};

/**
 * Statistiques d'un joueur cumulées sur les parties d'un match. Une clé jamais
 * saisie reste absente : l'export doit distinguer « zéro rapporté » de « rien
 * n'a été relevé », par exemple sur un match antérieur à l'ajout du preset.
 */
function sumMatchStats(
  match: TournamentMatch,
  playerId: string,
  statKeys: string[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const game of match.games) {
    const values = game.stats?.[playerId];
    if (!values) continue;
    for (const key of statKeys) {
      const value = values[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        totals[key] = (totals[key] ?? 0) + value;
      }
    }
  }
  return totals;
}

/**
 * Ordonne et enrichit les matchs : par phase, puis par ronde, puis par table
 * (les matchs sans table — les BYE — passent en dernier).
 */
export function buildMatchExportEntries({
  matches,
  players,
  phases,
  rounds,
  unknownPlayerLabel,
}: {
  matches: TournamentMatch[];
  players: MatchExportPlayer[];
  phases: Pick<TournamentPhase, "id" | "name" | "statsPresetKey">[];
  rounds: Pick<TournamentRound, "id" | "number" | "phaseId">[];
  unknownPlayerLabel: string;
}): MatchExportEntry[] {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const phasesById = new Map(phases.map((phase) => [phase.id, phase]));
  const roundsById = new Map(rounds.map((round) => [round.id, round]));
  const phaseOrder = new Map(phases.map((phase, index) => [phase.id, index]));

  const entries = matches.map((match) => {
    const round = roundsById.get(match.roundId);
    // Statistiques relevées par la phase du match : chaque phase a la sienne.
    const statKeys = presetStatKeys(getPreset(phasesById.get(match.phaseId)?.statsPresetKey));
    const entryPlayers = match.players.map((matchPlayer) => ({
      id: matchPlayer.playerId,
      label: formatPlayerLabel(playersById.get(matchPlayer.playerId), unknownPlayerLabel),
      score: matchPlayer.score,
      isWinner: match.winnerIds.includes(matchPlayer.playerId),
      ...(statKeys.length > 0
        ? { stats: sumMatchStats(match, matchPlayer.playerId, statKeys) }
        : {}),
    }));

    return {
      matchId: match.id,
      phaseId: match.phaseId,
      phaseName: phasesById.get(match.phaseId)?.name ?? "",
      roundId: match.roundId,
      roundNumber: round?.number ?? 0,
      tableNumber: match.tableNumber,
      status: match.status,
      players: entryPlayers,
      winners: entryPlayers.filter((player) => player.isWinner).map((player) => player.label),
      score: entryPlayers.map((player) => player.score).join(" - "),
    };
  });

  return entries.sort(
    (a, b) =>
      (phaseOrder.get(a.phaseId) ?? 0) - (phaseOrder.get(b.phaseId) ?? 0) ||
      a.roundNumber - b.roundNumber ||
      // Un match sans table (BYE) se range après les tables numérotées.
      (a.tableNumber ?? Number.MAX_SAFE_INTEGER) - (b.tableNumber ?? Number.MAX_SAFE_INTEGER)
  );
}

/** Colonne de statistique du CSV : clé du preset et intitulé traduit. */
export type MatchCsvStatColumn = { key: string; label: string };

export type MatchCsvLabels = {
  phase: string;
  round: string;
  table: string;
  status: string;
  player: string;
  games: string;
  winners: string;
  statusLabels: Record<TournamentMatchStatus, string>;
};

/**
 * Une cellule qui commence par l'un de ces caractères est interprétée comme une
 * formule par Excel et LibreOffice à l'ouverture du fichier. Les pseudos étant
 * saisis librement, ils pourraient déclencher l'exécution d'une formule chez
 * l'organisateur qui ouvre l'export.
 */
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Échappement CSV : neutralisation des formules, guillemets doublés, champ cité
 * dès qu'il porte un séparateur.
 */
function escapeCsvValue(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  // Les nombres viennent du modèle, jamais d'une saisie : rien à neutraliser.
  if (typeof value === "number") return String(value);

  // L'apostrophe force le tableur à lire la cellule comme du texte ; elle n'est
  // pas affichée dans la cellule une fois le fichier ouvert.
  const text = CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;

  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * CSV de la liste des matchs.
 *
 * Séparateur `;` et BOM UTF-8 : c'est ce qu'attend Excel en configuration
 * française, où un `,` casserait les colonnes et l'absence de BOM les accents.
 * Le nombre de colonnes joueur s'adapte au match le plus peuplé (les formats
 * multijoueurs dépassent les deux joueurs habituels), et chaque joueur porte
 * les statistiques relevées par le jeu (score de bataille, score de
 * destruction…) : l'export est l'archive du tournoi, il doit tout retenir.
 */
export function buildMatchesCsv(
  entries: MatchExportEntry[],
  labels: MatchCsvLabels,
  statColumns: MatchCsvStatColumn[] = []
): string {
  const maxPlayers = entries.reduce((max, entry) => Math.max(max, entry.players.length), 0);

  const header = [labels.phase, labels.round, labels.table, labels.status];
  for (let index = 0; index < maxPlayers; index++) {
    header.push(`${labels.player} ${index + 1}`, `${labels.games} ${index + 1}`);
    for (const column of statColumns) header.push(`${column.label} ${index + 1}`);
  }
  header.push(labels.winners);

  const rows = entries.map((entry) => {
    const row: (string | number | undefined)[] = [
      entry.phaseName,
      entry.roundNumber,
      entry.tableNumber,
      labels.statusLabels[entry.status] ?? entry.status,
    ];
    for (let index = 0; index < maxPlayers; index++) {
      const player = entry.players[index];
      row.push(player?.label, player ? player.score : undefined);
      for (const column of statColumns) row.push(player?.stats?.[column.key]);
    }
    row.push(entry.winners.join(" / "));
    return row;
  });

  return buildCsvDocument([header, ...rows]);
}

/**
 * Assemble un document CSV complet \u00e0 partir de ses lignes (en-t\u00eate inclus).
 *
 * S\u00e9parateur `;` et BOM UTF-8 : c'est ce qu'attend Excel en configuration
 * fran\u00e7aise, o\u00f9 un `,` casserait les colonnes et l'absence de BOM les accents.
 */
export function buildCsvDocument(rows: (string | number | undefined)[][]): string {
  const lines = rows.map((row) => row.map(escapeCsvValue).join(";"));
  // BOM : sans lui, Excel lit le fichier en ANSI et mange les accents.
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

/** Nom de fichier sûr, dérivé du nom du tournoi. */
export function buildCsvFileName(tournamentName: string, roundNumber?: number): string {
  const slug = tournamentName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  const base = slug || "tournoi";
  return roundNumber ? `${base}-ronde-${roundNumber}-matchs.csv` : `${base}-matchs.csv`;
}
