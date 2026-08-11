import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { User } from "@/lib/types/User";
import type { BattleReport, GameMatchGuest, GameMatchPlayer } from "@/lib/types/Match";

export type {
  GameMatchGuest,
  BattleReport,
  BattleReportArmy,
  BattleReportArmyUnit,
  BattleMap,
  BattleMapShape,
  BattleMapSnapshot,
  BattleMapTerrain,
  BattleMapUnitToken,
} from "@/lib/types/Match";

/**
 * Le même participant que dans `lib/types/Match.ts`, ré-exporté plutôt que
 * redéfini : deux copies du type divergeraient, et l'une d'elles ignorerait
 * alors qu'un `userId` peut désigner un invité.
 */
export type { GameMatchPlayer } from "@/lib/types/Match";

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
  guests?: GameMatchGuest[]; // Participants sans compte
  createdBy: User['id'];
  createdAt: Date;
  ratings?: GameMatchRating[]; // Évaluations des joueurs
  mvpVotes?: GameMatchMVPVote[]; // Votes pour le MVP
  winnerIds?: User['id'][]; // IDs des gagnants désignés par le créateur
  decks?: Record<User['id'], string>; // Decks utilisés par chaque joueur { playerId: deckId }
  battleReport?: BattleReport; // Présent = la partie est saisie en rapport de bataille
};
