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
