import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import { metaCacheTag } from "@/lib/meta/cache";
import { escapeRegex } from "@/lib/utils/regex";
import type { MetaEventMatch, MetaEventMatches, MetaEventPlayer } from "@/lib/meta/match-stats";

/**
 * Les matchs d'un tournoi de la méta, un document par tournoi : ses joueurs
 * (tous, pas seulement ceux dont le deck est importé) et chacun de ses matchs.
 *
 * Un tournoi se rattache à ses decks méta par la même source et la même date
 * (voir `lib/meta/tournaments.ts`), et à sa source extérieure par `eventRef`
 * (`locator:1227032`) : réimporter remplace le document.
 */
const COLLECTION = "metaEvents";

type MetaEventDoc = {
  _id?: ObjectId;
  gameId: string;
  eventRef: string;
  source: string;
  eventDate: Date;
  url?: string;
  importedAt: Date;
  importedBy: string;
  players: MetaEventPlayer[];
  matches: MetaEventMatch[];
};

export async function saveMetaEventMatches(doc: Omit<MetaEventDoc, "_id" | "importedAt">): Promise<void> {
  await db
    .collection<MetaEventDoc>(COLLECTION)
    .replaceOne({ gameId: doc.gameId, eventRef: doc.eventRef }, { ...doc, importedAt: new Date() }, { upsert: true });
}

/**
 * Les matchs de tous les tournois d'un jeu.
 *
 * Mis en cache par jeu comme l'échantillon des decks (`metaCacheTag`) : un
 * import de matchs l'invalide.
 */
export async function loadMetaEventsMatches(gameId: string): Promise<MetaEventMatches[]> {
  "use cache";
  cacheTag(metaCacheTag(gameId));
  cacheLife("hours");

  const docs = await db
    .collection<MetaEventDoc>(COLLECTION)
    .find({ gameId }, { projection: { gameId: 0, importedAt: 0, importedBy: 0 } })
    .sort({ eventDate: -1 })
    .toArray();

  return docs.map((doc) => ({
    id: (doc._id as ObjectId).toString(),
    source: doc.source,
    eventDate: new Date(doc.eventDate).toISOString(),
    ...(doc.url ? { url: doc.url } : {}),
    players: doc.players,
    matches: doc.matches,
  }));
}

/** Les tournois d'un jeu qui ont leurs matchs : `source|AAAA-MM-JJ`. */
export async function listMetaEventKeys(gameId: string): Promise<Set<string>> {
  const docs = await db
    .collection<MetaEventDoc>(COLLECTION)
    .find({ gameId }, { projection: { source: 1, eventDate: 1 } })
    .toArray();
  return new Set(docs.map((doc) => `${doc.source}|${new Date(doc.eventDate).toISOString().slice(0, 10)}`));
}

export type MetaEventSummary = {
  id: string;
  gameId: string;
  eventRef: string;
  source: string;
  eventDate: string;
  url?: string;
  players: MetaEventPlayer[];
  /** Les inscriptions qui ont joué la phase finale. */
  topPlayerIds: number[];
};

function toSummary(doc: MetaEventDoc): MetaEventSummary {
  const top = new Set<number>();
  for (const match of doc.matches ?? []) {
    if (match.phase !== "top") continue;
    top.add(match.a);
    if (match.b !== undefined) top.add(match.b);
  }

  return {
    id: (doc._id as ObjectId).toString(),
    gameId: doc.gameId,
    eventRef: doc.eventRef,
    source: doc.source,
    eventDate: new Date(doc.eventDate).toISOString(),
    ...(doc.url ? { url: doc.url } : {}),
    players: doc.players ?? [],
    topPlayerIds: [...top],
  };
}

/** Un tournoi importé, pour « C'est moi ». */
export async function getMetaEventSummary(id: string): Promise<MetaEventSummary | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await db
    .collection<MetaEventDoc>(COLLECTION)
    .findOne({ _id: new ObjectId(id) }, { projection: { importedAt: 0, importedBy: 0 } });

  return doc ? toSummary(doc) : null;
}

/** Les tournois importés dont le nom contient la recherche, du plus récent au plus ancien. */
export async function searchMetaEvents(query: string, gameId?: string, limit = 6): Promise<MetaEventSummary[]> {
  const filter: Record<string, unknown> = { source: { $regex: escapeRegex(query), $options: "i" } };
  if (gameId) filter.gameId = gameId;
  const docs = await db
    .collection<MetaEventDoc>(COLLECTION)
    .find(filter, { projection: { importedAt: 0, importedBy: 0 } })
    .sort({ eventDate: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toSummary);
}
