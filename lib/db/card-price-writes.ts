import 'server-only';

import db from "@/lib/mongodb";
import type { ObjectId, AnyBulkWriteOperation } from "mongodb";
import type { CardPriceDoc } from "@/lib/db/card-prices";
import type { CardPrice } from "@/lib/types/card-price";

/**
 * Écriture des relevés de prix, par les imports.
 *
 * À part des lectures (`lib/db/card-prices.ts`) parce que celles-ci suivent la
 * préférence du joueur qui regarde, et tirent donc la session et
 * l'authentification : de quoi empêcher les scripts d'import de se charger
 * hors de Next.
 */

const collection = () => db.collection<CardPriceDoc>("card-prices");

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
            ...(price.printings ? { printings: price.printings } : {}),
            sourceUpdatedAt: new Date(price.sourceUpdatedAt),
            updatedAt: new Date(price.updatedAt),
          },
          // Les variantes suivent le reste du relevé, réécrit entier à chaque
          // import : une variante qui n'y figure plus n'y garde pas de prix.
          ...(price.printings ? {} : { $unset: { printings: "" as const } }),
        },
        upsert: true,
      },
    }));

    const result = await collection().bulkWrite(operations);
    written += result.upsertedCount + result.modifiedCount;
  }

  return { written };
}
