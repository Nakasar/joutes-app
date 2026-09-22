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
