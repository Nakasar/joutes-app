import { ObjectId } from "bson";

export type TournamentStatus = "draft" | "in-progress" | "completed";
export type TournamentPhaseType = "freeform" | "swiss" | "bracket";
export type TournamentPhaseStatus = "not-started" | "in-progress" | "completed";
export type TournamentMatchFormat = "BO1" | "BO2" | "BO3" | "BO5";
export type TournamentRoundStatus = "in-progress" | "completed";
export type TournamentPlayerStatus = "active" | "dropped";
export type TournamentMatchStatus = "pending" | "in-progress" | "completed" | "disputed";

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
  addedBy: string;
  createdAt: Date;
};

export type TournamentPhase = {
  id: string;
  tournamentId: string;
  name: string;
  type: TournamentPhaseType;
  matchFormat: TournamentMatchFormat;
  plannedRounds?: number;
  topCut?: number;
  order: number;
  status: TournamentPhaseStatus;
  createdAt: Date;
};

export type TournamentRound = {
  id: string;
  tournamentId: string;
  phaseId: string;
  number: number;
  status: TournamentRoundStatus;
  createdAt: Date;
  completedAt?: Date;
};

export type TournamentMatch = {
  id: string;
  tournamentId: string;
  phaseId: string;
  roundId: string;
  // Tournament player ids (not user ids); player2Id null means a BYE.
  player1Id: string;
  player2Id: string | null;
  player1Score: number;
  player2Score: number;
  winnerId?: string | null;
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
