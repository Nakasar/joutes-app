import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { User } from "@/lib/types/User";

export type GameMatchPlayer = {
  userId: User['id'];
  username: string; // displayName#discriminator ou username
  displayName?: string;
  discriminator?: string;
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
};
