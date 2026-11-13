import type { SwuDeckList } from "@/lib/engine/swu/types";
import type { BotLevel, EngineDeckList, EngineMode } from "@/lib/engine/types";

export type GameTableStatus = "waiting" | "playing" | "finished" | "cancelled";

/** Un siège d'une table : une personne, ou un robot (`bot`). */
export type GameTableSeat = {
  userId?: string;
  name: string;
  bot?: BotLevel;
  /** Le nom du deck choisi, pour la salle d'attente. Jamais son contenu. */
  deckName: string;
  /** Carte-légende, ou leader à Star Wars: Unlimited (code du moteur), montrée en salle d'attente. */
  legend: string;
  /** La liste du moteur, dans le format du jeu de la table (`gameSlug`). */
  deck: EngineDeckList | SwuDeckList;
};

/**
 * Une table de jeu en ligne. Son identifiant sert aussi de code d'invitation.
 * La partie sur le serveur de parties a son propre identifiant (`engineId`),
 * tiré à chaque lancement : un lancement raté puis repris ne retombe jamais sur
 * une partie créée avec d'anciens sièges.
 */
export type GameTable = {
  id: string;
  gameSlug: string;
  mode: EngineMode;
  hostId: string;
  status: GameTableStatus;
  seats: GameTableSeat[];
  createdAt: string;
  engineId?: string;
  startedAt?: string;
  finishedAt?: string;
  result?: { winners: number[]; reason: string; turns?: number; points?: number[] };
};

/** Ce que tout le monde peut voir d'une table : les decks n'en sortent pas. */
export type GameTableSummary = Omit<GameTable, "seats" | "hostId" | "engineId"> & {
  /** Sans identifiant de compte : la salle se lit sans être connecté. */
  seats: (Omit<GameTableSeat, "deck" | "userId"> & { host: boolean })[];
  players: number;
};
