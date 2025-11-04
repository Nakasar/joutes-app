import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { User } from "@/lib/types/User";

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

export type GameMatch = {
  id: string;
  gameId: Game['id'];
  playedAt: Date;
  lairId?: Lair['id'];
  playerIds: string[]; // IDs des joueurs stockés en DB
  players: GameMatchPlayer[]; // Contient les détails des joueurs (récupérés via aggregate)
  createdBy: User['id'];
  createdAt: Date;
  ratings?: GameMatchRating[]; // Évaluations des joueurs
  mvpVotes?: GameMatchMVPVote[]; // Votes pour le MVP
  winners?: User['id'][]; // IDs des gagnants désignés par le créateur
};
