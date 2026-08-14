import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import type { CardPrice, CardPriceSource } from "@/lib/types/card-price";

/**
 * Relevés de prix des cartes, une place de marché à la fois.
 *
 * Un document par (jeu, carte, place de marché) : le relevé est un
 * instantané, réécrit à chaque import et jamais accumulé — cf.
 * docs/CARD_PRICES.md.
 */

type CardPriceDoc = Omit<CardPrice, "sourceUpdatedAt" | "updatedAt"> & {
  gameId: ObjectId;
  sourceUpdatedAt: Date;
  updatedAt: Date;
};

const collection = () => db.collection<CardPriceDoc>("card-prices");

function toCardPrice(doc: CardPriceDoc): CardPrice {
  return {
    cardId: doc.cardId,
    source: doc.source,
    currency: doc.currency,
    prices: doc.prices,
    offers: doc.offers,
    sourceUpdatedAt: doc.sourceUpdatedAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * L'unicité de `{gameId, cardId, source}` est ce qui rend l'import
 * rejouable : deux imports de suite réécrivent le même document au lieu d'en
 * empiler. Idempotent — `createIndex` ne fait rien si l'index existe déjà.
 */
export async function ensureCardPriceIndexes(): Promise<void> {
  await collection().createIndex({ gameId: 1, cardId: 1, source: 1 }, { unique: true, name: "gameId_cardId_source_unique" });
  await collection().createIndex({ gameId: 1, source: 1 }, { name: "gameId_source" });
}

/** Écrit les relevés d'un import, par paquets pour ne pas tenir un ordre géant. */
export async function upsertCardPrices(gameId: ObjectId, prices: CardPrice[]): Promise<{ written: number }> {
  const BATCH = 500;
  let written = 0;

  for (let index = 0; index < prices.length; index += BATCH) {
    const batch = prices.slice(index, index + BATCH);

    const operations: AnyBulkWriteOperation<CardPriceDoc>[] = batch.map((price) => ({
      updateOne: {
        filter: { gameId, cardId: price.cardId, source: price.source },
        update: {
          $set: {
            currency: price.currency,
            prices: price.prices,
            offers: price.offers,
            sourceUpdatedAt: new Date(price.sourceUpdatedAt),
            updatedAt: new Date(price.updatedAt),
          },
        },
        upsert: true,
      },
    }));

    const result = await collection().bulkWrite(operations);
    written += result.upsertedCount + result.modifiedCount;
  }

  return { written };
}

/** Relevés d'une carte, toutes places de marché confondues. */
export async function getCardPrices(gameId: ObjectId, cardId: string): Promise<CardPrice[]> {
  const docs = await collection().find({ gameId, cardId }).toArray();
  return docs.map(toCardPrice);
}

/**
 * Relevés de plusieurs cartes d'un coup, par identifiant de carte : de quoi
 * chiffrer une collection ou une liste de vente sans une requête par carte.
 */
export async function getCardPricesByCardId(
  gameId: ObjectId,
  cardIds: string[],
  source: CardPriceSource = "cardmarket"
): Promise<Map<string, CardPrice>> {
  if (cardIds.length === 0) {
    return new Map();
  }

  const docs = await collection().find({ gameId, source, cardId: { $in: cardIds } }).toArray();

  return new Map(docs.map((doc) => [doc.cardId, toCardPrice(doc)]));
}

/** Nombre de cartes du jeu qui portent un relevé, pour l'écran d'administration. */
export async function countCardPrices(gameId: ObjectId, source: CardPriceSource = "cardmarket"): Promise<number> {
  return collection().countDocuments({ gameId, source });
}
