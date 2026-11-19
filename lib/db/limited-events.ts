import { DateTime } from "luxon";
import type { Filter } from "mongodb";

import db from "@/lib/mongodb";
import type { LimitedEvent, LimitedEventSeat } from "@/lib/types/LimitedEvent";

/**
 * Les scellés et drafts en ligne : un document par évènement. Les règles (qui
 * rejoint, qui lance) sont dans `lib/engine/limited-events.ts` ; ce module ne
 * fait qu'écrire et lire, par des écritures conditionnelles.
 *
 * Index : `lib/db/indexes/users.ts`, section évènements de limité.
 */
export const LIMITED_EVENTS_COLLECTION = "limitedEvents";

type LimitedEventDoc = LimitedEvent & { memberIds: string[]; purgeAt: Date };

const now = () => DateTime.utc().toISO();

const collection = db.collection<LimitedEventDoc>(LIMITED_EVENTS_COLLECTION);

/** Un évènement en attente s'efface au bout d'une semaine, un évènement lancé au bout d'un mois. */
const WAITING_DAYS = 7;
const PLAYED_DAYS = 30;

const purgeIn = (days: number) => DateTime.utc().plus({ days }).toJSDate();

function toEvent(doc: LimitedEventDoc): LimitedEvent {
  return {
    id: doc.id,
    gameSlug: doc.gameSlug,
    kind: doc.kind,
    packs: doc.packs,
    players: doc.players,
    timers: doc.timers,
    hostId: doc.hostId,
    status: doc.status,
    seats: doc.seats,
    createdAt: doc.createdAt,
    ...(doc.engineId ? { engineId: doc.engineId } : {}),
    ...(doc.startedAt ? { startedAt: doc.startedAt } : {}),
  };
}

/** Faux si le code est déjà pris : l'appelant en tire un autre. */
export async function insertLimitedEvent(event: LimitedEvent): Promise<boolean> {
  try {
    await collection.insertOne({
      ...event,
      memberIds: event.seats.flatMap((seat) => (seat.userId ? [seat.userId] : [])),
      purgeAt: purgeIn(WAITING_DAYS),
    });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export async function getLimitedEvent(id: string): Promise<LimitedEvent | null> {
  const doc = await collection.findOne({ id }, { projection: { _id: 0 } });
  return doc ? toEvent(doc) : null;
}

/**
 * Assoit quelqu'un tant que l'évènement attend, en une seule écriture : la place
 * n'est prise que s'il en reste une, si la personne n'est pas déjà assise et,
 * pour un robot, si son nom est libre.
 */
export async function addLimitedEventSeat(id: string, capacity: number, seat: LimitedEventSeat): Promise<boolean> {
  const filter: Filter<LimitedEventDoc> = {
    id,
    status: "waiting",
    [`seats.${capacity - 1}`]: { $exists: false },
    ...(seat.userId ? { memberIds: { $ne: seat.userId } } : { "seats.name": { $ne: seat.name } }),
  };
  const result = await collection.updateOne(filter, {
    $push: { seats: seat },
    ...(seat.userId ? { $addToSet: { memberIds: seat.userId } } : {}),
  });
  return result.modifiedCount === 1;
}

/** Libère le siège d'une personne, ou celui d'un robot désigné par son nom. */
export async function removeLimitedEventSeat(id: string, target: { userId: string } | { bot: string }): Promise<boolean> {
  const result =
    "userId" in target
      ? await collection.updateOne(
          { id, status: "waiting" },
          { $pull: { seats: { userId: target.userId }, memberIds: target.userId } },
        )
      : await collection.updateOne(
          { id, status: "waiting" },
          { $pull: { seats: { name: { $eq: target.bot }, bot: { $exists: true } } } },
        );
  return result.modifiedCount === 1;
}

/**
 * Passe l'évènement « en cours » et le rend tel qu'il est lancé : les sièges
 * envoyés au serveur de parties sont ceux de ce document. `null` s'il n'attend
 * plus, s'il a moins de deux joueurs, ou si l'appelant n'en est pas l'hôte.
 */
export async function claimLimitedEventStart(id: string, hostId: string, engineId: string): Promise<LimitedEvent | null> {
  const doc = await collection.findOneAndUpdate(
    { id, hostId, status: "waiting", "seats.1": { $exists: true } },
    { $set: { status: "playing", startedAt: now(), engineId, purgeAt: purgeIn(PLAYED_DAYS) } },
    { returnDocument: "after", projection: { _id: 0 } },
  );
  return doc ? toEvent(doc) : null;
}

/** Remet en attente un évènement dont ce lancement-là a échoué côté serveur de parties. */
export async function revertLimitedEventStart(id: string, engineId: string): Promise<void> {
  await collection.updateOne(
    { id, engineId, status: "playing" },
    { $set: { status: "waiting", purgeAt: purgeIn(WAITING_DAYS) }, $unset: { startedAt: "", engineId: "" } },
  );
}

export async function cancelLimitedEvent(id: string): Promise<boolean> {
  const result = await collection.updateOne({ id, status: "waiting" }, { $set: { status: "cancelled" } });
  return result.modifiedCount === 1;
}

/**
 * Une personne n'a qu'un évènement en attente par jeu : en ouvrir un autre
 * ferme les précédents du même jeu.
 */
export async function cancelWaitingLimitedEventsOf(hostId: string, gameSlug: string): Promise<void> {
  await collection.updateMany({ hostId, gameSlug, status: "waiting" }, { $set: { status: "cancelled" } });
}

/** Un évènement que le serveur de parties ne connaît plus. */
export async function abandonLimitedEvent(id: string, engineId: string): Promise<boolean> {
  const result = await collection.updateOne({ id, engineId, status: "playing" }, { $set: { status: "cancelled" } });
  return result.modifiedCount === 1;
}

/** Un évènement dont le serveur de parties a joué tous les matchs. */
export async function finishLimitedEvent(id: string, engineId: string): Promise<boolean> {
  const result = await collection.updateOne({ id, engineId, status: "playing" }, { $set: { status: "finished" } });
  return result.modifiedCount === 1;
}

/** Les évènements d'une personne à un jeu, les plus récents d'abord. */
export async function listLimitedEventsOf(userId: string, gameSlug: string, limit = 10): Promise<LimitedEvent[]> {
  const docs = await collection
    .find({ memberIds: userId, gameSlug, status: { $ne: "cancelled" } }, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toEvent);
}
