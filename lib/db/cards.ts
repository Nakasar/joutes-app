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
