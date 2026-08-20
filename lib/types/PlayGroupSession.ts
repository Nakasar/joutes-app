import type { ObjectId } from "mongodb";
import type { PlayGroupPlace } from "@/lib/types/PlayGroup";

/**
 * Le cycle d'une session : sondage de disponibilités → session confirmée →
 * (optionnel) événement Joutes public.
 *
 * Les trois états vivent dans le même document parce que la session confirmée
 * *est* le sondage, une fois son créneau tranché : la garder au même endroit
 * conserve qui s'était déclaré disponible, et évite d'avoir à recoller deux
 * historiques pour compter la présence d'un membre.
 */
export type PlayGroupSessionStatus = "poll" | "confirmed" | "cancelled";

/** Un créneau proposé au sondage, et ceux qui s'y sont déclarés disponibles. */
export type PlayGroupSessionSlot = {
  id: string;
  /** ISO 8601 — date et heure du créneau proposé. */
  startsAt: string;
  voterIds: string[];
};

export type PlayGroupRsvpAnswer = "yes" | "maybe" | "no";

export type PlayGroupSessionRsvp = {
  userId: string;
  answer: PlayGroupRsvpAnswer;
  respondedAt: string;
};

export type PlayGroupSession = {
  id: string;
  playGroupId: string;
  title: string;
  gameId?: string;
  status: PlayGroupSessionStatus;
  place?: PlayGroupPlace;
  /** ISO 8601 — absent tant que le sondage n'est pas tranché. */
  startsAt?: string;
  endsAt?: string;
  /** Les créneaux du sondage ; vidés une fois le créneau confirmé. */
  slots?: PlayGroupSessionSlot[];
  /** ISO 8601 — la date de clôture annoncée du sondage. */
  pollClosesAt?: string;
  rsvps: PlayGroupSessionRsvp[];
  /** L'événement Joutes public créé depuis la session, s'il y en a un. */
  eventId?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export type PlayGroupSessionDocument = Omit<PlayGroupSession, "id"> & {
  _id: ObjectId;
  id: string;
};
