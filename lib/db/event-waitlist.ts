import db from "@/lib/mongodb";
import type { EventDocument } from "@/lib/db/events";
import type { RegistrationStatus, WaitlistEntry } from "@/lib/types/Event";

/**
 * Écritures de la liste d'attente d'un événement.
 *
 * Chacune est **conditionnelle** : le filtre porte l'état attendu, si bien
 * qu'une écriture concurrente (deux onglets, un cron qui passe au même
 * moment) échoue proprement au lieu d'écraser l'autre. Les règles — qui passe,
 * quand — vivent dans `lib/events/waitlist.ts` ; ici on ne fait qu'écrire.
 */

const COLLECTION_NAME = "events";

function events() {
  return db.collection<EventDocument>(COLLECTION_NAME);
}

/** Ajoute un joueur en fin de file, s'il n'y est pas déjà et n'est pas inscrit. */
export async function addToEventWaitlist(eventId: string, userId: string, joinedAt: Date): Promise<boolean> {
  const entry: WaitlistEntry = { userId, joinedAt: joinedAt.toISOString() };
  const result = await events().updateOne(
    { id: eventId, participants: { $ne: userId }, "waitlist.userId": { $ne: userId } },
    { $push: { waitlist: entry } }
  );
  return result.modifiedCount > 0;
}

/** Retire des joueurs de la file, offre en cours comprise. */
export async function removeFromEventWaitlist(eventId: string, userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) return false;
  const result = await events().updateOne(
    { id: eventId },
    { $pull: { waitlist: { userId: { $in: userIds } } } }
  );
  return result.modifiedCount > 0;
}

/**
 * Pose une offre sur l'entrée d'un joueur. N'écrit que si le joueur attend
 * encore sans offre : une offre n'est jamais faite deux fois.
 */
export async function markWaitlistOffer(
  eventId: string,
  userId: string,
  offeredAt: Date,
  offerExpiresAt: Date
): Promise<boolean> {
  const result = await events().updateOne(
    { id: eventId, waitlist: { $elemMatch: { userId, offeredAt: { $exists: false } } } },
    {
      $set: {
        "waitlist.$.offeredAt": offeredAt.toISOString(),
        "waitlist.$.offerExpiresAt": offerExpiresAt.toISOString(),
      },
    }
  );
  return result.modifiedCount > 0;
}

/**
 * Transforme une offre en inscription, en une seule écriture : le joueur sort
 * de la file et entre dans les participants. Échoue si l'offre n'existe pas
 * ou est échue — la place est alors déjà partie au suivant.
 */
export async function acceptWaitlistOffer(
  eventId: string,
  userId: string,
  status: RegistrationStatus,
  now: Date
): Promise<boolean> {
  const result = await events().updateOne(
    {
      id: eventId,
      participants: { $ne: userId },
      waitlist: { $elemMatch: { userId, offerExpiresAt: { $gt: now.toISOString() } } },
    },
    {
      $pull: { waitlist: { userId } },
      $addToSet: { participants: userId },
      $set: {
        [`participantRegistrations.${userId}`]: status,
        [`participantRegisteredAt.${userId}`]: now.toISOString(),
        boardsNeedsUpdate: true,
      },
    }
  );
  return result.modifiedCount > 0;
}

/** Règle le délai de réponse aux offres de l'événement. */
export async function setWaitlistResponseHours(eventId: string, hours: number): Promise<boolean> {
  const result = await events().updateOne({ id: eventId }, { $set: { waitlistResponseHours: hours } });
  return result.matchedCount > 0;
}

/** Les événements dont la file n'est pas vide : ce que le cron repasse. */
export async function listEventIdsWithWaitlist(): Promise<string[]> {
  const docs = await events()
    .find({ "waitlist.0": { $exists: true } }, { projection: { _id: 0, id: 1 } })
    .toArray();
  return docs.map((doc) => doc.id);
}

/** Vide la file d'un événement qui n'en a plus l'usage (annulé, commencé, passé). */
export async function clearEventWaitlist(eventId: string): Promise<boolean> {
  const result = await events().updateOne({ id: eventId }, { $set: { waitlist: [] } });
  return result.modifiedCount > 0;
}
