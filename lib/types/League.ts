import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { User } from "@/lib/types/User";

// Types de formats de ligue
export type LeagueFormat = "KILLER" | "POINTS" | "TARGETS";

// Configuration des hauts faits pour le format POINTS
export type Feat = {
  id: string;
  title: string;
  description?: string;
  points: number;
  maxPerEvent?: number;
  maxPerLeague?: number;
};

// Règles de points pour le format POINTS
export type PointsRules = {
  participation: number;
  victory: number;
  defeat: number;
  feats: Feat[];
};

// Configuration spécifique au format KILLER
export type KillerConfig = {
  targets: number; // Nombre de cibles en parallèle
};

// Configuration spécifique au format POINTS
export type PointsConfig = {
  pointsRules: PointsRules;
};

// Configuration spécifique au format TARGETS
export type TargetsConfig = {
  targets: number; // Nombre de cibles en parallèle
  victoryPoints?: number; // Points pour une victoire contre une cible
  defeatPoints?: number; // Points pour une défaite contre une cible
  drawPoints?: number; // Points pour un match nul contre une cible
};

// Historique des points d'un participant
export type PointHistoryEntry = {
  date: Date;
  points: number;
  reason: string;
  eventId?: string;
  featId?: string;
  matchId?: string; // ID du match de ligue associé
};

// Hauts faits obtenus par un participant
export type ParticipantFeat = {
  featId: string;
  earnedAt: Date;
  eventId?: string;
  matchId?: string; // ID du match de ligue associé
};

// Haut fait attribué lors d'un match
export type MatchFeatAward = {
  playerId: string; // Joueur qui a obtenu le haut fait
  featId: string;
  pointsCounted?: boolean; // Indique si les points ont été comptabilisés (false si limite atteinte)
};

// Match joué dans le cadre d'une ligue
export type LeagueMatch = {
  id: string;
  gameId: Game["id"];
  playedAt: Date;
  playerIds: User["id"][]; // Tous les joueurs du match
  winnerIds: User["id"][]; // Les gagnants du match
  featAwards?: MatchFeatAward[]; // Hauts faits attribués lors du match
  createdBy: User["id"];
  createdAt: Date;
  notes?: string; // Notes optionnelles sur le match
};

// Participant à une ligue
export type LeagueParticipant = {
  userId: User["id"];
  points: number;
  pointsHistory: PointHistoryEntry[];
  feats: ParticipantFeat[];
  joinedAt: Date;
  targets?: User["id"][]; // Cibles assignées au participant (KILLER et TARGETS)
  eliminatedBy?: User["id"]; // Joueur qui a éliminé ce participant (KILLER)
  eliminatedAt?: Date; // Date d'élimination (KILLER)
};

// Statut de la ligue
export type LeagueStatus = "DRAFT" | "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

// Type principal de la ligue
export type League = {
  id: string;
  name: string;
  description?: string;
  banner?: string;
  
  // Format et configuration
  format: LeagueFormat;
  killerConfig?: KillerConfig;
  pointsConfig?: PointsConfig;
  targetsConfig?: TargetsConfig;
  
  // Dates
  startDate?: Date;
  endDate?: Date;
  registrationDeadline?: Date;
  
  // Statut
  status: LeagueStatus;
  
  // Organisateurs et participants
  creatorId: User["id"];
  creator?: Pick<User, 'id' | 'username' | 'displayName' | 'discriminator' | 'avatar'>;
  organizerIds: User["id"][];
  participantsCount?: number;
  participants: LeagueParticipant[];
  
  // Paramètres
  maxParticipants?: number;
  minParticipants?: number;
  isPublic: boolean;
  invitationCode?: string;
  
  // Associations
  gameIds: Game["id"][];
  games: Pick<Game, 'id' | 'name' | 'slug' | 'icon'>[];
  lairIds: Lair["id"][];
  lairs: Pick<Lair, 'id' | 'name'>[];
  
  // Matchs de la ligue
  matches: LeagueMatch[];
  
  // Métadonnées
  createdAt: Date;
  updatedAt: Date;
};

// Type pour la création d'une ligue
export type CreateLeagueInput = Omit<League, "id" | "createdAt" | "updatedAt" | "participants" | "matches" | "games" | "lairs"> & {
  participants?: LeagueParticipant[];
  matches?: LeagueMatch[];
};

// Type pour la création d'un match de ligue
export type CreateLeagueMatchInput = Omit<LeagueMatch, "id" | "createdAt" | "createdBy">;

// Type pour la mise à jour d'une ligue
export type UpdateLeagueInput = Partial<Omit<League, "id" | "createdAt" | "creatorId">>;

// Type pour les résultats de recherche paginés
export type PaginatedLeaguesResult = {
  leagues: League[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// Type pour les options de recherche
export type SearchLeaguesOptions = {
  search?: string;
  status?: LeagueStatus | LeagueStatus[];
  format?: LeagueFormat;
  gameIds?: string[];
  creatorId?: string;
  participantId?: string;
  isPublic?: boolean;
  page?: number;
  limit?: number;
};
