import "server-only";

import { ObjectId } from "mongodb";
import { cacheLife, cacheTag } from "next/cache";

import type { CpTableCards } from "@/lib/engine/cyberpunk/cards";
import { cpEngineCards } from "@/lib/engine/cyberpunk/server";
import db from "@/lib/mongodb";

export const CP_TABLE_CARDS_CACHE_TAG = "engine-cp-table-cards";

type CatalogDoc = { id: string; name: string; image?: string; text?: string };

/**
 * Ce que la table affiche de chaque carte du moteur : l'illustration vient du
 * catalogue Joutes, le reste du moteur. Le catalogue et le moteur sont tous
 * deux en anglais : noms et textes sont ceux des cartes imprimées.
 */
export async function readCpTableCards(gameId: string): Promise<CpTableCards> {
  "use cache";
  cacheLife("days");
  cacheTag(CP_TABLE_CARDS_CACHE_TAG);

  const engine = [...cpEngineCards().values()];
  const docs = ObjectId.isValid(gameId)
    ? await db
        .collection<CatalogDoc & { gameId: ObjectId }>("cards")
        .find(
          { gameId: new ObjectId(gameId), id: { $in: engine.map((card) => card.code) } },
          { projection: { _id: 0, id: 1, name: 1, image: 1, text: 1 } },
        )
        .toArray()
    : [];
  const byId = new Map(docs.map((doc) => [doc.id, doc]));

  const cards: CpTableCards = {};
  for (const card of engine) {
    const doc = byId.get(card.code);
    const text = card.text || doc?.text;
    cards[card.code] = {
      code: card.code,
      def: card.id,
      name: card.subtitle ? `${card.name}, ${card.subtitle}` : card.name,
      title: card.name,
      kind: card.kind,
      color: card.color,
      ...(doc?.image ? { image: doc.image } : {}),
      ...(text ? { text } : {}),
      cost: card.cost,
      power: card.power,
      ram: card.ram,
      sell: card.sell,
      tags: card.tags,
      playable: card.coverage !== "none",
    };
  }
  return cards;
}
