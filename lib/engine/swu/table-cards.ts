import "server-only";

import { ObjectId } from "mongodb";
import { cacheLife, cacheTag } from "next/cache";

import { toSwuCatalogId, type SwuTableCards } from "@/lib/engine/swu/cards";
import { swuEngineCards } from "@/lib/engine/swu/server";
import type { SwuEngineCard } from "@/lib/engine/swu/types";
import db from "@/lib/mongodb";

export const SWU_TABLE_CARDS_CACHE_TAG = "engine-swu-table-cards";

type CatalogDoc = {
  id: string;
  name: string;
  title?: string;
  englishName?: string;
  image?: string;
  backImage?: string;
  text?: string;
};

/** Le nom complet d'une carte du moteur, tel que le catalogue range son nom anglais. */
function fullName(card: SwuEngineCard): string {
  return card.subtitle ? `${card.name}, ${card.subtitle}` : card.name;
}

/**
 * La fiche du catalogue d'une carte du moteur. Les variantes d'illustration
 * (Hyperspace…) sont renumérotées par le site officiel et peuvent porter le
 * numéro d'une autre carte : parmi les fiches d'un même identifiant, on garde
 * celle dont le nom anglais est celui du moteur.
 */
export function pickCatalogDoc<T extends { englishName?: string }>(docs: T[], card: SwuEngineCard): T | undefined {
  const wanted = fullName(card).toLowerCase();
  return docs.find((doc) => doc.englishName?.toLowerCase() === wanted) ?? docs[0];
}

/**
 * Ce que la table affiche de chaque carte du moteur : nom, illustration et
 * texte français viennent du catalogue Joutes, les chiffres du moteur.
 */
export async function readSwuTableCards(gameId: string): Promise<SwuTableCards> {
  "use cache";
  cacheLife("days");
  cacheTag(SWU_TABLE_CARDS_CACHE_TAG);

  const engine = [...swuEngineCards().values()];
  const docs = ObjectId.isValid(gameId)
    ? await db
        .collection<CatalogDoc & { gameId: ObjectId }>("cards")
        .find(
          { gameId: new ObjectId(gameId), id: { $in: engine.map((card) => toSwuCatalogId(card.code)) } },
          { projection: { _id: 0, id: 1, name: 1, title: 1, englishName: 1, image: 1, backImage: 1, text: 1 } },
        )
        .toArray()
    : [];
  const byId = new Map<string, CatalogDoc[]>();
  for (const doc of docs) {
    const list = byId.get(doc.id) ?? [];
    list.push(doc);
    byId.set(doc.id, list);
  }

  const cards: SwuTableCards = {};
  for (const card of engine) {
    const doc = pickCatalogDoc(byId.get(toSwuCatalogId(card.code)) ?? [], card);
    const text = doc?.text || [card.text, card.epic, card.back].filter(Boolean).join("\n");
    cards[card.code] = {
      code: card.code,
      def: card.id,
      // Le site officiel laisse parfois une espace en fin de titre.
      name: doc?.name?.trim() || fullName(card),
      title: doc?.title?.trim() || card.name,
      engineName: card.name,
      kind: card.kind,
      ...(doc?.image ? { image: doc.image } : {}),
      ...(doc?.backImage ? { back: doc.backImage } : {}),
      ...(text ? { text } : {}),
      cost: card.cost,
      power: card.power,
      hp: card.hp,
      aspects: card.aspects,
      arena: card.arena,
      playable: card.coverage !== "none",
    };
  }
  return cards;
}
