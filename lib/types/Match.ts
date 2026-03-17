import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { User } from "@/lib/types/User";

// Types communs
export type GameMatchPlayer = {
  userId: User['id'];
  username: string; // displayName#discriminator ou username
  displayName?: string;
  discriminator?: string;
};

export type GameMatchRating = {
  userId: User['id'];
  rating: 1 | 2 | 3 | 4 | 5; // 1: angry, 2: sad, 3: neutral, 4: happy, 5: very happy
};

export type GameMatchMVPVote = {
  voterId: User['id'];
  votedForId: User['id'];
};

export type MatchFeatAward = {
  playerId: string; // Joueur qui a obtenu le haut fait
  featId: string;
  pointsCounted?: boolean; // Indique si les points ont été comptabilisés (false si limite atteinte)
};

// Type de base pour tous les matchs
export type BaseMatch = {
  id: string;
  matchType: 'game' | 'league' | 'event';
  playedAt: Date;
  lairId?: Lair['id'];
  createdBy: User['id'];
  createdAt: Date;
  updatedAt?: Date;
  reportedBy?: User['id'];
  reportedAt?: Date;
  confirmedBy?: User['id'];
  confirmedAt?: Date;
};

// Match de jeu (hors ligue et événement)
export type GameTypeMatch = BaseMatch & {
  matchType: 'game';
  gameId: Game['id'];
  playerIds: User['id'][];
  players?: GameMatchPlayer[]; // Détails des joueurs (récupérés via aggregate)
  ratings?: GameMatchRating[]; // Évaluations des joueurs
  mvpVotes?: GameMatchMVPVote[]; // Votes pour le MVP
  winnerIds?: User['id'][]; // IDs des gagnants désignés par le créateur
  decks?: Record<User['id'], string>; // Decks utilisés par chaque joueur { playerId: deckId }
};

// Match de ligue
export type LeagueTypeMatch = BaseMatch & {
  matchType: 'league';
  leagueId: string;
  gameId: Game['id'];
  playerIds: User['id'][]; // Tous les joueurs du match
  playerScores?: Record<User['id'], number>; // Parties gagnées par joueur
  winnerIds: User['id'][]; // Les gagnants du match
  featAwards?: MatchFeatAward[]; // Hauts faits attribués lors du match
  notes?: string; // Notes optionnelles sur le match
  status?: "PENDING" | "REPORTED" | "CONFIRMED";
  confirmedPlayerIds?: User['id'][]; // Joueurs ayant confirmé le résultat
  lairConfirmedBy?: User['id'];
  targetId?: User['id']; // Pour les matchs de mode KILLER
  isKillerMatch?: boolean;
  lairName?: string;
  decks?: Record<User['id'], string>; // Decks utilisés par chaque joueur { playerId: deckId }
};

// Match d'événement (tournoi)
export type EventTypeMatch = BaseMatch & {
  matchType: 'event';
  eventId: string;
  phaseId: string;
  player1Id: User['id'];
  player2Id: User['id'] | null; // null pour un BYE
  player1Name?: string; // Nom du joueur 1 (ajouté par agrégation)
  player2Name?: string; // Nom du joueur 2 (ajouté par agrégation)
  player1Score: number;
  player2Score: number;
  winnerId?: User['id'] | null; // ID du gagnant
  round?: number; // Numéro de ronde (pour les rondes suisses)
  bracketPosition?: string; // Position dans le bracket (ex: "QF1", "SF1", "F")
  status: 'pending' | 'in-progress' | 'completed' | 'disputed';
  decks?: Record<User['id'], string>; // Decks utilisés par chaque joueur { playerId: deckId }
};

// Type union pour tous les types de matchs
export type Match = GameTypeMatch | LeagueTypeMatch | EventTypeMatch;

// Type guards pour différencier les types de matchs
export function isGameMatch(match: { matchType: Match['matchType'] }): match is GameTypeMatch {
  return match.matchType === 'game';
}

export function isLeagueMatch(match: { matchType: Match['matchType'] }): match is LeagueTypeMatch {
  return match.matchType === 'league';
}

export function isEventMatch(match: { matchType: Match['matchType'] }): match is EventTypeMatch {
  return match.matchType === 'event';
}

// Alias pour la rétrocompatibilité (à supprimer progressivement)
export type GameMatch = GameTypeMatch;
export type LeagueMatch = LeagueTypeMatch;
export type EventMatch = EventTypeMatch;
