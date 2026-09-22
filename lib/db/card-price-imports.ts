import 'server-only';

import db from "@/lib/mongodb";
import type { ObjectId } from "mongodb";
import type { CardPriceSource } from "@/lib/types/card-price";
import type { ImportCoverage } from "@/lib/prices/import-guard";

/**
 * Bilan du dernier import de prix écrit, un document par (jeu, place de
 * marché).
 *
 * C'est la référence du garde-fou (`lib/prices/import-guard.ts`) : un import
 * se compare au dernier qui a été écrit. Seul l'import qui écrit met ce bilan
 * à jour — ni un `--dry-run`, ni un import refusé.
 */

type CardPriceImportDoc = ImportCoverage & {
  gameId: ObjectId;
  source: CardPriceSource;
  written: number;
  sourceUpdatedAt: Date;
  importedAt: Date;
};

const collection = () => db.collection<CardPriceImportDoc>("card-price-imports");

let indexesReady: Promise<void> | null = null;

/**
 * Un seul bilan par (jeu, place de marché) : sans cette unicité, deux imports
 * lancés ensemble — le cron et le script — en écriraient chacun un, et le
 * garde-fou se comparerait à l'un ou l'autre au hasard.
 *
 * L'échec n'est pas mémorisé : la tentative suivante réessaie.
 */
function ensureCardPriceImportIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = collection()
      .createIndex({ gameId: 1, source: 1 }, { unique: true, name: "gameId_source_unique" })
      .then(() => undefined)
      .catch((error) => {
        indexesReady = null;
        throw error;
      });
  }

  return indexesReady;
}

export async function getLastCardPriceImport(
  gameId: ObjectId,
  source: CardPriceSource
): Promise<ImportCoverage | null> {
  const doc = await collection().findOne({ gameId, source });
  return doc ? { cards: doc.cards, matched: doc.matched, priced: doc.priced } : null;
}

export async function recordCardPriceImport(
  gameId: ObjectId,
  source: CardPriceSource,
  report: ImportCoverage & { written: number; sourceUpdatedAt: Date; importedAt: Date }
): Promise<void> {
  await ensureCardPriceImportIndexes();
  await collection().updateOne(
    { gameId, source },
    {
      $set: {
        cards: report.cards,
        matched: report.matched,
        priced: report.priced,
        written: report.written,
        sourceUpdatedAt: report.sourceUpdatedAt,
        importedAt: report.importedAt,
      },
    },
    { upsert: true }
  );
}
