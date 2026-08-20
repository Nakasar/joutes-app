import db from "@/lib/mongodb";
import { ObjectId, WithId } from "mongodb";
import type { PlayGroupPlace } from "@/lib/types/PlayGroup";
import type {
  PlayGroupRsvpAnswer,
  PlayGroupSession,
  PlayGroupSessionDocument,
  PlayGroupSessionSlot,
  PlayGroupSessionStatus,
} from "@/lib/types/PlayGroupSession";

const PLAY_GROUP_SESSIONS_COLLECTION = "playGroupSessions";

const sessionsCollection = db.collection<PlayGroupSessionDocument>(PLAY_GROUP_SESSIONS_COLLECTION);

function toSession(doc: WithId<PlayGroupSessionDocument>): PlayGroupSession {
  return {
    id: doc.id || doc._id.toString(),
    playGroupId: doc.playGroupId,
    title: doc.title,
    gameId: doc.gameId,
    status: doc.status,
    place: doc.place,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    slots: doc.slots,
    pollClosesAt: doc.pollClosesAt,
    rsvps: doc.rsvps ?? [],
    eventId: doc.eventId,
    createdById: doc.createdById,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Les sessions d'un groupe, sondages d'abord puis sessions confirmées par
 * date.
 *
 * Le tri n'est pas fait en base : un sondage n'a pas de `startsAt`, et le
 * comparer aux sessions datées demanderait une projection artificielle pour un
 * volume qui tient de toute façon dans une page.
 */
export async function listPlayGroupSessions(
  playGroupId: string,
  options: { statuses?: PlayGroupSessionStatus[] } = {},
): Promise<PlayGroupSession[]> {
  const statuses = options.statuses ?? ["poll", "confirmed"];
  const docs = await sessionsCollection.find({ playGroupId, status: { $in: statuses } }).toArray();

  return docs
    .map(toSession)
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "poll" ? -1 : 1;
      }

      return (a.startsAt ?? a.createdAt).localeCompare(b.startsAt ?? b.createdAt);
    });
}

export async function getPlayGroupSession(sessionId: string): Promise<PlayGroupSession | null> {
  const doc = await sessionsCollection.findOne({ id: sessionId });
  return doc ? toSession(doc) : null;
}

/**
 * La prochaine session confirmée — celle que l'Établi met en avant.
 *
 * « Prochaine » se juge sur la fin de la session quand elle est connue : une
 * soirée commencée à 19h30 reste la prochaine chose qui attend une réponse
 * jusqu'à ce qu'elle se termine.
 */
export async function getNextPlayGroupSession(playGroupId: string): Promise<PlayGroupSession | null> {
  const now = new Date().toISOString();
  const docs = await sessionsCollection
    .find({ playGroupId, status: "confirmed" })
    .sort({ startsAt: 1 })
    .toArray();

  const upcoming = docs.map(toSession).find((session) => (session.endsAt ?? session.startsAt ?? "") >= now);

  return upcoming ?? null;
}

export async function createPlayGroupSession(input: {
  playGroupId: string;
  title: string;
  gameId?: string;
  place?: PlayGroupPlace;
  startsAt?: string;
  endsAt?: string;
  slots?: { startsAt: string }[];
  pollClosesAt?: string;
  createdById: string;
}): Promise<PlayGroupSession> {
  const now = new Date().toISOString();
  const isPoll = !!input.slots && input.slots.length > 0;

  const doc: PlayGroupSessionDocument = {
    _id: new ObjectId(),
    id: new ObjectId().toString(),
    playGroupId: input.playGroupId,
    title: input.title.trim(),
    gameId: input.gameId,
    status: isPoll ? "poll" : "confirmed",
    place: input.place,
    startsAt: isPoll ? undefined : input.startsAt,
    endsAt: isPoll ? undefined : input.endsAt,
    slots: isPoll
      ? input.slots?.map((slot) => ({ id: new ObjectId().toString(), startsAt: slot.startsAt, voterIds: [] }))
      : undefined,
    pollClosesAt: isPoll ? input.pollClosesAt : undefined,
    rsvps: [],
    createdById: input.createdById,
    createdAt: now,
    updatedAt: now,
  };

  await sessionsCollection.insertOne(doc);

  return toSession(doc);
}

/** Bascule la disponibilité du membre sur un créneau du sondage. */
export async function togglePlayGroupSlotVote(
  sessionId: string,
  slotId: string,
  userId: string,
): Promise<PlayGroupSession | null> {
  const session = await getPlayGroupSession(sessionId);
  if (!session || session.status !== "poll") {
    return null;
  }

  const slots: PlayGroupSessionSlot[] = (session.slots ?? []).map((slot) =>
    slot.id === slotId
      ? {
          ...slot,
          voterIds: slot.voterIds.includes(userId)
            ? slot.voterIds.filter((id) => id !== userId)
            : [...slot.voterIds, userId],
        }
      : slot,
  );

  const result = await sessionsCollection.findOneAndUpdate(
    { id: sessionId },
    { $set: { slots, updatedAt: new Date().toISOString() } },
    { returnDocument: "after" },
  );

  return result ? toSession(result) : null;
}

/**
 * Tranche le sondage : le créneau devient la date de la session, et ceux qui
 * s'y étaient déclarés disponibles sont repris comme présents.
 *
 * Reprendre les disponibilités évite de redemander deux fois la même chose au
 * même membre — s'être dit disponible jeudi *est* une réponse pour jeudi.
 */
export async function confirmPlayGroupSessionSlot(
  sessionId: string,
  slotId: string,
): Promise<PlayGroupSession | null> {
  const session = await getPlayGroupSession(sessionId);
  if (!session || session.status !== "poll") {
    return null;
  }

  const slot = (session.slots ?? []).find((item) => item.id === slotId);
  if (!slot) {
    return null;
  }

  const now = new Date().toISOString();
  const result = await sessionsCollection.findOneAndUpdate(
    { id: sessionId },
    {
      $set: {
        status: "confirmed",
        startsAt: slot.startsAt,
        rsvps: slot.voterIds.map((userId) => ({ userId, answer: "yes" as PlayGroupRsvpAnswer, respondedAt: now })),
        updatedAt: now,
      },
      $unset: { slots: "", pollClosesAt: "" },
    },
    { returnDocument: "after" },
  );

  return result ? toSession(result) : null;
}

/** Pose — ou retire, si la réponse est identique — la présence d'un membre. */
export async function setPlayGroupSessionRsvp(
  sessionId: string,
  userId: string,
  answer: PlayGroupRsvpAnswer,
): Promise<PlayGroupSession | null> {
  const session = await getPlayGroupSession(sessionId);
  if (!session) {
    return null;
  }

  const current = session.rsvps.find((rsvp) => rsvp.userId === userId);
  const others = session.rsvps.filter((rsvp) => rsvp.userId !== userId);
  const now = new Date().toISOString();

  const rsvps =
    current?.answer === answer ? others : [...others, { userId, answer, respondedAt: now }];

  const result = await sessionsCollection.findOneAndUpdate(
    { id: sessionId },
    { $set: { rsvps, updatedAt: now } },
    { returnDocument: "after" },
  );

  return result ? toSession(result) : null;
}

export async function updatePlayGroupSession(
  sessionId: string,
  patch: Partial<Pick<PlayGroupSession, "title" | "gameId" | "place" | "startsAt" | "endsAt" | "status" | "eventId">>,
): Promise<PlayGroupSession | null> {
  const result = await sessionsCollection.findOneAndUpdate(
    { id: sessionId },
    { $set: { ...patch, updatedAt: new Date().toISOString() } },
    { returnDocument: "after" },
  );

  return result ? toSession(result) : null;
}

export async function deletePlayGroupSession(sessionId: string): Promise<boolean> {
  const result = await sessionsCollection.deleteOne({ id: sessionId });
  return result.deletedCount > 0;
}

export async function deletePlayGroupSessions(playGroupId: string): Promise<number> {
  const result = await sessionsCollection.deleteMany({ playGroupId });
  return result.deletedCount ?? 0;
}

/**
 * Le taux de présence de chaque membre, dérivé des sessions passées.
 *
 * Seules les sessions confirmées et déjà écoulées comptent : une session à
 * venir sans réponse ne dit rien de l'assiduité de personne. Un groupe sans
 * session passée renvoie une carte vide, et l'appelant n'affiche pas de jauge.
 */
export async function readPlayGroupAttendance(
  playGroupId: string,
): Promise<{ total: number; attendedByUserId: Record<string, number> }> {
  const now = new Date().toISOString();
  const docs = await sessionsCollection.find({ playGroupId, status: "confirmed" }).toArray();
  const past = docs.map(toSession).filter((session) => (session.endsAt ?? session.startsAt ?? "") < now);

  const attendedByUserId: Record<string, number> = {};
  for (const session of past) {
    for (const rsvp of session.rsvps) {
      if (rsvp.answer === "yes") {
        attendedByUserId[rsvp.userId] = (attendedByUserId[rsvp.userId] ?? 0) + 1;
      }
    }
  }

  return { total: past.length, attendedByUserId };
}

/** Les lieux du groupe, du plus utilisé au moins utilisé. */
export async function readPlayGroupPlaces(
  playGroupId: string,
): Promise<{ place: PlayGroupPlace; count: number }[]> {
  const docs = await sessionsCollection.find({ playGroupId }).toArray();

  const byKey = new Map<string, { place: PlayGroupPlace; count: number }>();
  for (const doc of docs) {
    const place = doc.place;
    if (!place) {
      continue;
    }

    const key = place.kind === "joutes" ? `joutes:${place.lairId}` : `${place.kind}:${place.label ?? ""}`;
    const entry = byKey.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      byKey.set(key, { place, count: 1 });
    }
  }

  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

export async function createPlayGroupSessionIndexes() {
  await sessionsCollection.createIndex({ playGroupId: 1, status: 1, startsAt: 1 });
  await sessionsCollection.createIndex({ id: 1 }, { unique: true });
}
