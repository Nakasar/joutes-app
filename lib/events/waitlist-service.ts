import "server-only";

import { DateTime } from "luxon";
import { getEventById } from "@/lib/db/events";
import {
  acceptWaitlistOffer,
  addToEventWaitlist,
  clearEventWaitlist,
  markWaitlistOffer,
  removeFromEventWaitlist,
} from "@/lib/db/event-waitlist";
import { notifyUser } from "@/lib/services/notifications";
import type { Event } from "@/lib/types/Event";
import {
  canJoinDirectly,
  isWaitlistOpen,
  isWaitlistOver,
  planWaitlist,
  viewerWaitlistStatus,
} from "./waitlist";

/**
 * Fait avancer la liste d'attente d'un événement.
 *
 * Appelée après tout ce qui peut libérer une place — désistement, retrait
 * d'un participant, statut changé, capacité augmentée, offre déclinée — et
 * par le cron `event-waitlists` pour les offres échues. Idempotente : la
 * rappeler sans que rien n'ait changé n'écrit rien et ne notifie personne,
 * car une offre n'est posée que sur une entrée qui n'en a pas.
 *
 * Ne lève jamais : une file qui n'avance pas ne doit pas faire échouer le
 * désistement qui l'a déclenchée. Le cron repassera.
 */
export async function advanceEventWaitlist(eventId: string, now: Date = new Date()): Promise<{
  offered: number;
  expired: number;
}> {
  try {
    const event = await getEventById(eventId);
    if (!event || !event.waitlist?.length) {
      return { offered: 0, expired: 0 };
    }

    if (isWaitlistOver(event, now)) {
      await clearEventWaitlist(eventId);
      return { offered: 0, expired: 0 };
    }

    const plan = planWaitlist(event, now);

    if (plan.expired.length > 0) {
      await removeFromEventWaitlist(eventId, plan.expired.map((entry) => entry.userId));
      await Promise.all(plan.expired.map((entry) => notifyOfferExpired(event, entry.userId)));
    }

    let offered = 0;
    for (const entry of plan.offers) {
      const marked = await markWaitlistOffer(eventId, entry.userId, now, plan.offerExpiresAt);
      if (marked) {
        offered++;
        await notifyOffer(event, entry.userId, plan.offerExpiresAt);
      }
    }

    return { offered, expired: plan.expired.length };
  } catch (error) {
    console.error(`Liste d'attente de l'événement ${eventId} : échec de l'avancement`, error);
    return { offered: 0, expired: 0 };
  }
}

/** « jeudi 24 septembre à 10:23 », à l'heure de Paris comme le reste du site. */
function formatDeadline(date: Date): string {
  return DateTime.fromJSDate(date)
    .setZone("Europe/Paris")
    .setLocale("fr")
    .toFormat("cccc d LLLL 'à' HH:mm");
}

async function notifyOffer(event: Event, userId: string, expiresAt: Date) {
  try {
    await notifyUser(
      userId,
      "Une place s'est libérée",
      `Une place s'est libérée pour « ${event.name} ». Elle vous est réservée jusqu'au ${formatDeadline(expiresAt)} : acceptez-la avant, sinon elle sera proposée au joueur suivant.`,
      { link: `/events/${event.id}` }
    );
  } catch (error) {
    console.error(`Notification d'offre de place à ${userId} échouée`, error);
  }
}

async function notifyOfferExpired(event: Event, userId: string) {
  try {
    await notifyUser(
      userId,
      "Place non réservée",
      `Sans réponse de votre part, la place pour « ${event.name} » a été proposée au joueur suivant et vous avez quitté la liste d'attente.`,
      { link: `/events/${event.id}` }
    );
  } catch (error) {
    console.error(`Notification d'offre expirée à ${userId} échouée`, error);
  }
}

export type WaitlistOperationResult =
  | { success: true }
  | { success: false; error: string; status: number };

function fail(error: string, status = 400): WaitlistOperationResult {
  return { success: false, error, status };
}

/**
 * Rejoindre la file d'un événement. Réservé à un événement complet : tant
 * qu'on peut s'inscrire directement, la file n'a pas lieu d'être.
 */
export async function joinEventWaitlist(event: Event, userId: string, now: Date = new Date()): Promise<WaitlistOperationResult> {
  if (event.participants?.includes(userId)) {
    return fail("Vous êtes déjà inscrit à cet événement", 409);
  }
  if (event.waitlist?.some((entry) => entry.userId === userId)) {
    return fail("Vous êtes déjà sur la liste d'attente", 409);
  }
  if (!isWaitlistOpen(event, now)) {
    return fail("La liste d'attente de cet événement est fermée", 409);
  }
  if (canJoinDirectly(event, now)) {
    return fail("Il reste des places : inscrivez-vous directement", 409);
  }

  const added = await addToEventWaitlist(event.id, userId, now);
  return added ? { success: true } : fail("Impossible de rejoindre la liste d'attente", 409);
}

/** Quitter la file. Une offre en cours est abandonnée : la place passe au suivant. */
export async function leaveEventWaitlist(event: Event, userId: string): Promise<WaitlistOperationResult> {
  const removed = await removeFromEventWaitlist(event.id, [userId]);
  if (!removed) {
    return fail("Vous n'êtes pas sur la liste d'attente", 404);
  }
  await advanceEventWaitlist(event.id);
  return { success: true };
}

/** Accepter la place offerte : le joueur devient inscrit. */
export async function acceptEventWaitlistOffer(event: Event, userId: string, now: Date = new Date()): Promise<WaitlistOperationResult> {
  const status = viewerWaitlistStatus(event, userId, now);
  if (!status) {
    return fail("Vous n'êtes pas sur la liste d'attente", 404);
  }
  if (!status.offer) {
    return fail("Aucune place ne vous est proposée pour le moment, ou le délai de réponse est dépassé", 409);
  }

  // La place a été réservée : elle se prend sans repasser par la capacité.
  const accepted = await acceptWaitlistOffer(event.id, userId, "REGISTERED", now);
  return accepted
    ? { success: true }
    : fail("Le délai de réponse est dépassé : la place a été proposée au joueur suivant", 409);
}

/** Décliner la place offerte : le joueur quitte la file, le suivant est notifié. */
export async function declineEventWaitlistOffer(event: Event, userId: string, now: Date = new Date()): Promise<WaitlistOperationResult> {
  const status = viewerWaitlistStatus(event, userId, now);
  if (!status?.offer) {
    return fail("Aucune place ne vous est proposée", 404);
  }
  return leaveEventWaitlist(event, userId);
}
