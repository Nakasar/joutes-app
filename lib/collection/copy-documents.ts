import type { ObjectId } from "mongodb";
import { resolvePrinting } from "@/lib/cards/printings";
import type { ImportedEntry } from "@/lib/collection/formats/types";

/**
 * Les documents `collection-cards` d'un lot d'exemplaires : un par exemplaire,
 * comme partout ailleurs dans la collection.
 *
 * La variante décide de l'illustration et peut imposer le foil, comme lorsqu'on
 * ajoute un exemplaire à la main depuis la fiche d'une carte.
 *
 * `batchId` marque les exemplaires écrits d'un seul geste (un import, l'ajout
 * d'une extension) : c'est ce qui permet de les retirer ensemble, et eux seuls.
 */
export function copyDocuments(
  entry: ImportedEntry,
  userId: ObjectId,
  batchId?: ObjectId
): Record<string, unknown>[] {
  const printing = resolvePrinting(entry.card, entry.printingId);
  const document = {
    cardId: entry.card.id,
    setCode: entry.card.setCode,
    collectorNumber: entry.card.collectorNumber,
    name: entry.card.name,
    image: printing.image ?? entry.card.image,
    userId,
    foil: entry.foil || printing.foil,
    ...(printing.printingId !== undefined && { printingId: printing.printingId }),
    ...(printing.printingName !== undefined && { printingName: printing.printingName }),
    ...(entry.language !== undefined && { language: entry.language }),
    ...(entry.condition !== undefined && { condition: entry.condition }),
    ...(entry.grade !== undefined && { grade: entry.grade }),
    ...(entry.obtainedAt !== undefined && { obtainedAt: entry.obtainedAt }),
    ...(entry.acquisitionPrice !== undefined && { acquisitionPrice: entry.acquisitionPrice }),
    ...(entry.acquisitionCurrency !== undefined && { acquisitionCurrency: entry.acquisitionCurrency }),
    ...(batchId !== undefined && { batchId }),
  };
  return Array.from({ length: entry.quantity }, () => ({ ...document }));
}
