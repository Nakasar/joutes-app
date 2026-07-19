import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export type CardNameMatch = {
  id: string;
  name: string;
  image: string;
  setCode: string;
  collectorNumber: string;
  type?: string;
  text?: string;
};

export async function getCardsByNames(gameId: ObjectId, names: string[]): Promise<CardNameMatch[]> {
  if (names.length === 0) return [];

  return db
    .collection<CardNameMatch & { gameId: ObjectId }>("cards")
    .find(
      { gameId, name: { $in: names } },
      { projection: { _id: 0, id: 1, name: 1, image: 1, setCode: 1, collectorNumber: 1, type: 1, text: 1 } }
    )
    .collation({ locale: "en", strength: 2 })
    .toArray();
}

export async function getCardsByIds(gameId: ObjectId, ids: string[]): Promise<CardNameMatch[]> {
  if (ids.length === 0) return [];

  return db
    .collection<CardNameMatch & { gameId: ObjectId }>("cards")
    .find(
      { gameId, id: { $in: ids } },
      { projection: { _id: 0, id: 1, name: 1, image: 1, setCode: 1, collectorNumber: 1, type: 1, text: 1 } }
    )
    .toArray();
}

/**
 * One representative {id, name} per distinct card name for a game (reprints
 * collapse to a single arbitrary printing) — used by the Loupe feature to
 * build a single regex matching every known card name against free text.
 */
export async function getAllCardNamesById(gameId: ObjectId): Promise<{ id: string; name: string }[]> {
  return db
    .collection("cards")
    .aggregate<{ id: string; name: string }>([
      { $match: { gameId } },
      { $group: { _id: { $toLower: "$name" }, id: { $first: "$id" }, name: { $first: "$name" } } },
      { $project: { _id: 0, id: 1, name: 1 } },
    ])
    .toArray();
}

/**
 * One representative {id, name} per distinct card name within a single set
 * (optionally narrowed to one language) — small enough to ship to the client
 * for an in-memory fuzzy index, unlike the full game card list.
 */
export async function getCardNamesBySet(
  gameId: ObjectId,
  setCode: string,
  lang?: string
): Promise<{ id: string; name: string }[]> {
  const match: { gameId: ObjectId; setCode: string; lang?: string } = { gameId, setCode };
  if (lang) {
    match.lang = lang;
  }

  return db
    .collection("cards")
    .aggregate<{ id: string; name: string }>([
      { $match: match },
      { $group: { _id: { $toLower: "$name" }, id: { $first: "$id" }, name: { $first: "$name" } } },
      { $project: { _id: 0, id: 1, name: 1 } },
    ])
    .toArray();
}

/**
 * Looks up a card from an AI vision identification, most precise tier
 * first: a set + collector number alone pins down a single printing
 * regardless of how well the name itself was read, so it's tried before
 * falling back to an exact (case-insensitive) name match.
 */
export async function findCardByAiIdentification(
  gameId: ObjectId,
  identification: {
    name?: string | null;
    setCode?: string | null;
    collectorNumber?: string | null;
    lang?: string | null;
  }
): Promise<{ id: string; name: string } | null> {
  const { name, setCode, collectorNumber, lang } = identification;

  const baseFilter: Record<string, unknown> = { gameId };
  if (lang) {
    baseFilter.lang = lang;
  }

  const collection = db.collection<{ id: string; name: string }>("cards");
  const findOptions = { projection: { _id: 0, id: 1, name: 1 }, collation: { locale: "en", strength: 2 } };

  if (setCode && collectorNumber) {
    const card = await collection.findOne({ ...baseFilter, setCode, collectorNumber }, findOptions);
    if (card) return card;
  }

  if (name) {
    const exactFilter = setCode ? { ...baseFilter, name, setCode } : { ...baseFilter, name };
    const card = await collection.findOne(exactFilter, findOptions);
    if (card) return card;
  }

  return null;
}
