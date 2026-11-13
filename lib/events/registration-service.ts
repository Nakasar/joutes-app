import "server-only";

import { addParticipantToEvent, getEventById, removeParticipantFromEvent } from "@/lib/db/events";
import { ensureUserTag, getUserById } from "@/lib/db/users";
import type { Event, RegistrationStatus } from "@/lib/types/Event";
import { canJoinDirectly } from "./waitlist";
import { advanceEventWaitlist } from "./waitlist-service";

/**
 * Inscription d'une personne à un événement, partagée par l'action serveur
 * du site et par `POST /api/events/{id}/registration` (app mobile).
 * `full` signale qu'il faut passer par la liste d'attente.
 */
export type RegistrationResult =
  | { success: true; registrationStatus?: RegistrationStatus }
  | { success: false; error: string; status: number; full?: boolean };

export async function registerToEvent(
  eventOrId: Event | string,
  userId: string,
  now: Date = new Date()
): Promise<RegistrationResult> {
  const event = typeof eventOrId === "string" ? await getEventById(eventOrId) : eventOrId;
  if (!event) {
    return { success: false, error: "Événement introuvable", status: 404 };
  }

  if (!event.allowJoin) {
    return { success: false, error: "Les inscriptions à cet événement sont fermées", status: 409 };
  }

  if (event.runningState && event.runningState !== "not-started") {
    return {
      success: false,
      error: "Impossible de rejoindre un événement déjà commencé ou terminé",
      status: 409,
    };
  }

  if (event.participants?.includes(userId)) {
    return { success: false, error: "Vous êtes déjà inscrit à cet événement", status: 409 };
  }

  // Complet — places réservées aux offres de la file comprises —, ou des
  // joueurs attendent déjà : l'inscription passe par la liste d'attente.
  if (!canJoinDirectly(event, now)) {
    return { success: false, error: "Cet événement est complet", status: 409, full: true };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { success: false, error: "Utilisateur introuvable", status: 404 };
  }
  if (!user.displayName || !user.discriminator) {
    await ensureUserTag(userId);
  }

  const registrationStatus: RegistrationStatus = event.preRegistration ? "PRE_REGISTERED" : "REGISTERED";
  const added = await addParticipantToEvent(event.id, userId, registrationStatus);
  if (!added) {
    return { success: false, error: "Impossible de s'inscrire à l'événement", status: 500 };
  }

  return { success: true, registrationStatus };
}

/** Désinscription ; la place libérée est offerte au premier de la file. */
export async function unregisterFromEvent(eventId: string, userId: string): Promise<RegistrationResult> {
  const removed = await removeParticipantFromEvent(eventId, userId);
  if (!removed) {
    return { success: false, error: "Impossible de quitter l'événement", status: 400 };
  }

  await advanceEventWaitlist(eventId);
  return { success: true };
}
