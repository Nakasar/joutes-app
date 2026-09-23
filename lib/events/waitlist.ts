import type { Event, WaitlistEntry } from "@/lib/types/Event";

/**
 * Liste d'attente d'un événement complet : les règles, sans base de données.
 *
 * Un événement qui a un nombre maximum de participants ouvre une file une fois
 * complet. Quand une place se libère (désistement, retrait par l'organisation,
 * capacité augmentée), elle est **offerte** au premier de la file qui n'a pas
 * encore d'offre : il est notifié, et la place lui est réservée jusqu'à
 * l'échéance de l'offre. Accepter l'inscrit ; décliner ou laisser expirer le
 * sort de la file, et la place passe au suivant.
 *
 * Deux règles tiennent la file honnête :
 *
 * — une place réservée par une offre en cours compte comme prise : personne ne
 *   peut la souffler par une inscription directe pendant que le premier de la
 *   file réfléchit ;
 * — tant que des joueurs attendent, on ne s'inscrit plus directement, même si
 *   une place semble libre : on passe par la file, derrière eux.
 *
 * Module pur : c'est ce qui le rend testable. Les dates sont des chaînes ISO,
 * comparées une fois analysées.
 */

/** Délai laissé par défaut pour accepter une place libérée. */
export const DEFAULT_WAITLIST_RESPONSE_HOURS = 48;

/** Délais proposés à l'organisation. */
export const WAITLIST_RESPONSE_HOURS_OPTIONS = [2, 6, 12, 24, 48, 72] as const;

export type WaitlistEventState = Pick<
  Event,
  | "maxParticipants"
  | "registeredParticipantsCount"
  | "waitlist"
  | "waitlistResponseHours"
  | "startDateTime"
  | "status"
  | "runningState"
  | "allowJoin"
>;

function toMillis(iso: string | undefined): number {
  if (!iso) return NaN;
  return Date.parse(iso);
}

/** Délai de réponse de l'événement, en heures. */
export function responseHoursOf(event: Pick<Event, "waitlistResponseHours">): number {
  const hours = event.waitlistResponseHours;
  return typeof hours === "number" && hours > 0 ? hours : DEFAULT_WAITLIST_RESPONSE_HOURS;
}

/** La file, du premier arrivé au dernier. */
export function sortedWaitlist(waitlist: WaitlistEntry[] | undefined): WaitlistEntry[] {
  return [...(waitlist ?? [])].sort((a, b) => toMillis(a.joinedAt) - toMillis(b.joinedAt));
}

/** Une offre en cours : posée, et pas encore échue. */
export function isActiveOffer(entry: WaitlistEntry, now: Date): boolean {
  return entry.offerExpiresAt !== undefined && toMillis(entry.offerExpiresAt) > now.getTime();
}

/** Une offre posée dont l'échéance est passée. */
export function isExpiredOffer(entry: WaitlistEntry, now: Date): boolean {
  return entry.offerExpiresAt !== undefined && toMillis(entry.offerExpiresAt) <= now.getTime();
}

/** Ceux qui attendent encore leur tour : aucune offre ne leur a été faite. */
export function waitingEntries(waitlist: WaitlistEntry[] | undefined): WaitlistEntry[] {
  return sortedWaitlist(waitlist).filter((entry) => entry.offeredAt === undefined);
}

/** Places tenues par une offre en cours. */
export function reservedSeats(event: Pick<Event, "waitlist">, now: Date): number {
  return (event.waitlist ?? []).filter((entry) => isActiveOffer(entry, now)).length;
}

/**
 * Places réellement libres : ni prises par un inscrit, ni réservées par une
 * offre. `Infinity` pour un événement sans maximum.
 */
export function freeSeats(
  event: Pick<Event, "maxParticipants" | "registeredParticipantsCount" | "waitlist">,
  now: Date
): number {
  if (!event.maxParticipants) return Infinity;
  const taken = (event.registeredParticipantsCount ?? 0) + reservedSeats(event, now);
  return Math.max(0, event.maxParticipants - taken);
}

/**
 * L'événement accepte-t-il encore des mouvements de file ? Il faut un maximum
 * (sans lui, pas de file), un événement ni annulé ni commencé, des
 * inscriptions ouvertes par l'organisation, et un début encore à venir.
 */
export function isWaitlistOpen(event: WaitlistEventState, now: Date): boolean {
  if (!event.maxParticipants) return false;
  return acceptsWaitlistMoves(event, now);
}

/**
 * Une file est-elle définitivement close ? Annulé, commencé ou passé :
 * plus aucune place ne se libérera, la file n'a plus lieu d'être.
 */
export function isWaitlistOver(event: WaitlistEventState, now: Date): boolean {
  if (event.status === "cancelled") return true;
  if (event.runningState && event.runningState !== "not-started") return true;
  const start = toMillis(event.startDateTime);
  return !Number.isNaN(start) && start <= now.getTime();
}

function acceptsWaitlistMoves(event: WaitlistEventState, now: Date): boolean {
  if (event.status === "cancelled") return false;
  if (event.runningState && event.runningState !== "not-started") return false;
  if (event.allowJoin === false) return false;
  const start = toMillis(event.startDateTime);
  return Number.isNaN(start) || start > now.getTime();
}

/**
 * Peut-on s'inscrire directement ? Oui sans maximum ; sinon il faut une place
 * libre **et** personne qui attende déjà.
 */
export function canJoinDirectly(event: WaitlistEventState, now: Date): boolean {
  if (!event.maxParticipants) return true;
  return freeSeats(event, now) > 0 && waitingEntries(event.waitlist).length === 0;
}

/**
 * Échéance d'une offre faite maintenant : le délai de l'événement, raccourci
 * au début de l'événement s'il tombe avant.
 */
export function offerDeadline(event: WaitlistEventState, now: Date): Date {
  const deadline = now.getTime() + responseHoursOf(event) * 60 * 60 * 1000;
  const start = toMillis(event.startDateTime);
  return new Date(Number.isNaN(start) ? deadline : Math.min(deadline, start));
}

export type WaitlistPlan = {
  /** Offres échues : ces joueurs sortent de la file. */
  expired: WaitlistEntry[];
  /** Joueurs à qui offrir une place, dans l'ordre de la file. */
  offers: WaitlistEntry[];
  /** Échéance des nouvelles offres. */
  offerExpiresAt: Date;
};

/**
 * Ce qu'il faut faire de la file à cet instant : sortir les offres échues,
 * puis offrir chaque place libre au suivant qui attend.
 *
 * Les offres échues sont retirées même quand la file est fermée (événement
 * commencé, annulé, inscriptions suspendues…) : elles ne réservent plus rien.
 * Aucune offre n'est faite dans ce cas.
 */
export function planWaitlist(event: WaitlistEventState, now: Date): WaitlistPlan {
  const expired = sortedWaitlist(event.waitlist).filter((entry) => isExpiredOffer(entry, now));
  const expiredIds = new Set(expired.map((entry) => entry.userId));
  const remaining = (event.waitlist ?? []).filter((entry) => !expiredIds.has(entry.userId));
  const offerExpiresAt = offerDeadline(event, now);

  if (!acceptsWaitlistMoves(event, now)) {
    return { expired, offers: [], offerExpiresAt };
  }

  // Sans maximum (retiré par l'organisation), tout le monde a sa place.
  const seats = freeSeats({ ...event, waitlist: remaining }, now);
  const offers = waitingEntries(remaining).slice(0, Number.isFinite(seats) ? seats : undefined);

  return { expired, offers, offerExpiresAt };
}

export type ViewerWaitlistStatus = {
  /** Rang dans la file, à partir de 1. */
  position: number;
  /** Taille de la file. */
  total: number;
  joinedAt: string;
  /** Présente quand une place est réservée à ce joueur. */
  offer?: { offeredAt: string; expiresAt: string };
};

/** Où en est un joueur dans la file, ou `null` s'il n'y est pas. */
export function viewerWaitlistStatus(
  event: Pick<Event, "waitlist">,
  userId: string,
  now: Date
): ViewerWaitlistStatus | null {
  const queue = sortedWaitlist(event.waitlist);
  const index = queue.findIndex((entry) => entry.userId === userId);
  if (index === -1) return null;

  const entry = queue[index];
  return {
    position: index + 1,
    total: queue.length,
    joinedAt: entry.joinedAt,
    ...(isActiveOffer(entry, now) && entry.offeredAt && entry.offerExpiresAt
      ? { offer: { offeredAt: entry.offeredAt, expiresAt: entry.offerExpiresAt } }
      : {}),
  };
}

/**
 * Les participants dans l'ordre de leur inscription. Une inscription sans date
 * (antérieure au champ) garde sa place dans le tableau et passe devant celles
 * qui en ont une : elle est forcément plus ancienne.
 */
export function orderParticipants(
  participants: string[] | undefined,
  registeredAt: Record<string, string> | undefined
): string[] {
  const list = participants ?? [];
  return list
    .map((userId, index) => ({ userId, index, at: toMillis(registeredAt?.[userId]) }))
    .sort((a, b) => {
      const aKnown = !Number.isNaN(a.at);
      const bKnown = !Number.isNaN(b.at);
      if (aKnown && bKnown && a.at !== b.at) return a.at - b.at;
      if (aKnown !== bKnown) return aKnown ? 1 : -1;
      return a.index - b.index;
    })
    .map((item) => item.userId);
}
