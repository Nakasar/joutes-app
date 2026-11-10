import type { BotLevel, EngineDeckList, EngineMode } from "@/lib/engine/types";

export type GameTableStatus = "waiting" | "playing" | "finished" | "cancelled";

/** Un siège d'une table : une personne, ou un robot (`bot`). */
export type GameTableSeat = {
  userId?: string;
  name: string;
  bot?: BotLevel;
  /** Le nom du deck choisi, pour la salle d'attente. Jamais son contenu. */
  deckName: string;
  /** Carte-légende (code du moteur), montrée en salle d'attente. */
  legend: string;
  deck: EngineDeckList;
};

/**
 * Une table de jeu en ligne. Son identifiant sert aussi de code d'invitation
 * et d'identifiant de partie sur le serveur de parties.
 */
export type GameTable = {
  id: string;
  gameSlug: string;
  mode: EngineMode;
  hostId: string;
  status: GameTableStatus;
  seats: GameTableSeat[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: { winners: number[]; reason: string; turns?: number; points?: number[] };
};

/** Ce que tout le monde peut voir d'une table : les decks n'en sortent pas. */
export type GameTableSummary = Omit<GameTable, "seats"> & {
  seats: Omit<GameTableSeat, "deck">[];
  players: number;
};
