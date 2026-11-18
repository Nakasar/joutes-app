import type { LimitedKind } from "@/lib/engine/limited";
import type { BotLevel } from "@/lib/engine/types";

export type LimitedEventStatus = "waiting" | "playing" | "cancelled";

/** Un siège d'un évènement : une personne, ou un robot (`bot`). */
export type LimitedEventSeat = { userId?: string; name: string; bot?: BotLevel };

/** Les délais d'un évènement en ligne, en secondes ; 0 : pas de limite. */
export type LimitedTimers = { pick: number; build: number };

/**
 * Un scellé ou un draft en ligne : la salle d'attente tenue par le site. Une
 * fois lancé, l'évènement vit sur le serveur de parties (`engineId`), qui seul
 * voit les boosters ; le site n'en garde que les sièges.
 */
export type LimitedEvent = {
  id: string;
  gameSlug: string;
  kind: LimitedKind;
  /** L'extension de chaque booster, dans l'ordre d'ouverture. */
  packs: string[];
  /** Le nombre de places autour de la table. */
  players: number;
  timers: LimitedTimers;
  hostId: string;
  status: LimitedEventStatus;
  seats: LimitedEventSeat[];
  createdAt: string;
  engineId?: string;
  startedAt?: string;
};

/** Ce que tout le monde peut voir d'un évènement. */
export type LimitedEventSummary = Omit<LimitedEvent, "seats" | "hostId" | "engineId"> & {
  seats: (Omit<LimitedEventSeat, "userId"> & { host: boolean })[];
};
