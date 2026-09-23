import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";

/**
 * Le réglage « affiches de la semaine en MP Discord », sur le compte :
 * `notifications.discord.posterDigest`. Les règles vivent dans
 * `lib/posters/digest.ts` ; ici, on lit et on écrit.
 */

export type PosterDigestSubscriber = {
  userId: string;
  refs: string[];
  lastSentWeek?: string;
};

/** Les affiches choisies par un compte, et la semaine du dernier envoi. */
export async function getPosterDigest(userId: string): Promise<{ refs: string[]; lastSentWeek?: string }> {
  if (!ObjectId.isValid(userId)) return { refs: [] };
  const doc = await db
    .collection("user")
    .findOne({ _id: new ObjectId(userId) }, { projection: { "notifications.discord.posterDigest": 1 } });
  const digest = doc?.notifications?.discord?.posterDigest;
  return { refs: Array.isArray(digest?.refs) ? digest.refs : [], lastSentWeek: digest?.lastSentWeek };
}

export async function setPosterDigestRefs(userId: string, refs: string[]): Promise<void> {
  if (!ObjectId.isValid(userId)) return;
  await db
    .collection("user")
    .updateOne({ _id: new ObjectId(userId) }, { $set: { "notifications.discord.posterDigest.refs": refs } });
}

/**
 * Les abonnés dont l'envoi de la semaine reste à faire, par tranche : le cron
 * repasse jusqu'à ce qu'il n'en reste plus.
 */
export async function listDuePosterDigests(weekKey: string, limit: number): Promise<PosterDigestSubscriber[]> {
  const docs = await db
    .collection("user")
    .find(
      {
        "notifications.discord.posterDigest.refs.0": { $exists: true },
        "notifications.discord.posterDigest.lastSentWeek": { $ne: weekKey },
      },
      { projection: { _id: 1, "notifications.discord.posterDigest": 1 }, limit }
    )
    .toArray();

  return docs.map((doc) => ({
    userId: doc._id.toString(),
    refs: doc.notifications?.discord?.posterDigest?.refs ?? [],
    lastSentWeek: doc.notifications?.discord?.posterDigest?.lastSentWeek,
  }));
}

/** Marque la semaine comme traitée, envoi réussi ou abandonné. */
export async function markPosterDigestSent(userId: string, weekKey: string): Promise<void> {
  if (!ObjectId.isValid(userId)) return;
  await db
    .collection("user")
    .updateOne(
      { _id: new ObjectId(userId) },
      { $set: { "notifications.discord.posterDigest.lastSentWeek": weekKey } }
    );
}
