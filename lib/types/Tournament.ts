import { ObjectId } from "bson";
import type { PlayerStanding } from "@/lib/utils/pairing";

export type TournamentStatus = "draft" | "in-progress" | "completed";
// - freeform : pas de génération automatique des matchs.
// - swiss : rondes suisses, appariées selon le classement.
// - elimination : seuls les vainqueurs passent à la ronde suivante, ré-appariés
//   selon le classement ou aléatoirement (eliminationSeeding).
// - bracket : arbre d'élimination figé, seedé selon le classement d'entrée.
export type TournamentPhaseType = "freeform" | "swiss" | "elimination" | "bracket";
export type TournamentPhaseStatus = "not-started" | "in-progress" | "completed";
export type TournamentRoundStatus = "in-progress" | "completed";
export type TournamentPlayerStatus = "active" | "dropped";
export type TournamentMatchStatus = "pending" | "in-progress" | "completed" | "disputed";

// Comment le résultat d'une partie du best-of est renseigné.
// - selection : on désigne le vainqueur de chaque partie.
// - points : les joueurs renseignent leurs points, le vainqueur de la partie
//   en est déduit (score le plus élevé ; égalité = partie nulle).
export type TournamentResultMode = "points" | "selection";

// Comment les points de classement d'un match sont attribués.
// - fixed : points fixes par victoire / défaite / égalité.
// - rank_offset : points = N + offset[rang], N étant le nombre de joueurs du
//   match, à partir d'un tableau d'offsets par rang.
export type TournamentScoringMethod = "fixed" | "rank_offset";

// Ré-appariement des vainqueurs entre rondes d'une phase à élimination.
export type TournamentEliminationSeeding = "standings" | "random";

export type TournamentFixedScoring = { win: number; loss: number; draw: number };

export const DEFAULT_FIXED_SCORING: TournamentFixedScoring = { win: 3, loss: 0, draw: 1 };
// Offsets par défaut ajoutés à N (nombre de joueurs du match) selon le rang :
// 1er = N+3, 2e = N+1, 3e = N-1, 4e = N-3, etc.
export const DEFAULT_RANK_OFFSETS: number[] = [3, 1, -1, -3, -4, -5, -7];

export type Tournament = {
  id: string;
  name: string;
  eventId?: string;
  gameId?: string;
  status: TournamentStatus;
  currentPhaseId?: string;
  settings: {
    allowSelfReporting: boolean;
    requireConfirmation: boolean;
  };
  createdBy: string;
  organizerIds: string[];
  createdAt: Date;
  updatedAt?: Date;
};

export type TournamentPlayer = {
  id: string;
  tournamentId: string;
  userId?: string;
  displayName: string;
  seed?: number;
  status: TournamentPlayerStatus;
  // Secret de synchronisation propre au joueur (préfixe tpsk_), généré à
  // l'inscription. Utilisable comme Bearer token pour accéder au tournoi en
  // tant que ce joueur (portail joueur des invités sans compte). Ne doit être
  // exposé qu'aux organisateurs du tournoi.
  syncKey: string;
  addedBy: string;
  createdAt: Date;
};

export type TournamentPhase = {
  id: string;
  tournamentId: string;
  name: string;
  type: TournamentPhaseType;
  // Nombre de parties du best-of (best-of-n). Défaut 1.
  bestOf: number;
  // Méthode de désignation du vainqueur de chaque partie. Défaut "selection".
  resultMode: TournamentResultMode;
  // Méthode d'attribution des points de classement. Défaut "fixed".
  scoringMethod: TournamentScoringMethod;
  // Utilisé quand scoringMethod === "fixed".
  fixedScoring: TournamentFixedScoring;
  // Utilisé quand scoringMethod === "rank_offset".
  rankOffsets: number[];
  // Ré-appariement des vainqueurs pour une phase à élimination. Défaut "standings".
  eliminationSeeding: TournamentEliminationSeeding;
  plannedRounds?: number;
  // Nombre de joueurs qualifiés à l'entrée de la phase (top cut). Absent = tous.
  topCut?: number;
  // Nombre de joueurs par match généré automatiquement. Par défaut 2-2 (duel).
  // Un intervalle plus large (ex: 3-4) génère des « pods » multijoueurs en
  // phase suisse. Le bracket reste strictement 2-2.
  minPlayersPerMatch: number;
  maxPlayersPerMatch: number;
  order: number;
  status: TournamentPhaseStatus;
  createdAt: Date;
};

// Classement figé d'une ronde : snapshot calculé et persisté au moment où
// l'organisateur valide la ronde, pour ne pas le recalculer à chaque lecture.
// Réutilise PlayerStanding (source du calcul) et n'ajoute que les champs
// d'affichage, pour rester aligné si le calcul de classement évolue.
export type TournamentRoundStanding = PlayerStanding & {
  displayName: string;
  userId?: string;
  playerStatus: TournamentPlayerStatus;
};

export type TournamentRound = {
  id: string;
  tournamentId: string;
  phaseId: string;
  number: number;
  status: TournamentRoundStatus;
  // Classement de la phase figé à l'issue de la ronde. Absent tant que
  // l'organisateur n'a pas validé la ronde ; rafraîchi via un recalcul.
  standings?: TournamentRoundStanding[];
  standingsValidatedAt?: Date;
  createdAt: Date;
  completedAt?: Date;
};

export type TournamentMatchPlayer = {
  // Tournament player id (not a user id).
  playerId: string;
  // Nombre de parties du best-of gagnées par ce joueur (agrégat dérivé de games).
  score: number;
};

// Résultat d'une partie du best-of.
export type TournamentGameResult = {
  // Vainqueur de la partie (id de joueur de tournoi). null = partie nulle.
  // En mode "points", il est déduit des points ; en mode "selection", il est
  // désigné directement.
  winnerId?: string | null;
  // Mode "points" uniquement : points par joueur de tournoi pour cette partie.
  points?: Record<string, number>;
};

export type TournamentMatch = {
  id: string;
  tournamentId: string;
  phaseId: string;
  roundId: string;
  // 1..N players; a single-player match is a BYE. Swiss/bracket generation
  // always produces 1-2 players, larger matches support multiplayer formats
  // (created manually, typically in freeform phases).
  players: TournamentMatchPlayer[];
  // Détail des parties du best-of jouées. Vide tant qu'aucun résultat.
  games: TournamentGameResult[];
  // Empty while no result; on a completed match, empty means a draw between
  // all players, otherwise the (co-)winners.
  winnerIds: string[];
  bracketPosition?: string;
  status: TournamentMatchStatus;
  reportedBy?: string;
  confirmedBy?: string;
  createdAt: Date;
  updatedAt?: Date;
};

export type TournamentDb = Omit<Tournament, "id">;
export type TournamentPlayerDb = Omit<TournamentPlayer, "id" | "tournamentId"> & { tournamentId: ObjectId };
export type TournamentPhaseDb = Omit<TournamentPhase, "id" | "tournamentId"> & { tournamentId: ObjectId };
export type TournamentRoundDb = Omit<TournamentRound, "id" | "tournamentId" | "phaseId"> & {
  tournamentId: ObjectId;
  phaseId: ObjectId;
};
export type TournamentMatchDb = Omit<TournamentMatch, "id" | "tournamentId" | "phaseId" | "roundId"> & {
  tournamentId: ObjectId;
  phaseId: ObjectId;
  roundId: ObjectId;
};
