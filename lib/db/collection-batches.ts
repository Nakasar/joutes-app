import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/mongodb";
import { buildCollectionFormatContext } from "@/lib/collection/format-context";
import { copyDocuments } from "@/lib/collection/copy-documents";
import {
  gameSetCards,
  nameKey,
  planSetFill,
  printingKey,
  raritiesOf,
  setPrintings,
  type OwnedCounts,
  type SetFillOptions,
  type SetFillPlan,
} from "@/lib/collection/set-fill";
import type { CollectionLanguage } from "@/lib/schemas/collection.schema";
import { removeSellListItemsByCollectionEntryIds } from "@/lib/db/sell-lists";

/**
 * Lots d'exemplaires écrits d'un seul geste : l'ajout rapide d'une extension,
 * et l'import d'un fichier. Chaque exemplaire du lot porte le même `batchId`,
 * ce qui permet d'annuler le lot sans toucher au reste de la collection.
 */

export type QuickAddSet = {
  setCode: string;
  name?: string;
  /** Tirages distincts : le set maître. */
  masterTotal: number;
  /** Cartes distinctes par nom : le set de jeu. */
  gameTotal: number;
  rarities: string[];
};

type Game = { id: string; slug?: string };

/** Les extensions d'un jeu, avec ce qu'il faut pour choisir quoi ajouter. */
export async function getQuickAddSets(game: Game): Promise<QuickAddSet[]> {
  const context = await buildCollectionFormatContext(game);
  const codes = [...new Set(context.catalog.map((card) => card.setCode).filter(Boolean))].sort();
  return codes.map((setCode) => {
    const printings = setPrintings(context.catalog, setCode);
    return {
      setCode,
      ...(context.setNames[setCode] ? { name: context.setNames[setCode] } : {}),
      masterTotal: printings.length,
      gameTotal: gameSetCards(printings).length,
      rarities: raritiesOf(printings),
    };
  });
}

/**
 * Ce que possède la personne parmi les cartes de cette extension, pour le mode
 * « compléter ». Limité à l'extension : une réimpression ailleurs ne complète
 * pas ce set-ci.
 */
async function ownedCounts(userId: ObjectId, setCode: string, names: string[]): Promise<OwnedCounts> {
  const rows = await db
    .collection("collection-cards")
    .aggregate<{ _id: { name: string; setCode: string; collectorNumber: unknown }; n: number }>([
      { $match: { userId, setCode, name: { $in: names } } },
      { $group: { _id: { name: "$name", setCode: "$setCode", collectorNumber: "$collectorNumber" }, n: { $sum: 1 } } },
    ])
    .toArray();

  const counts: OwnedCounts = { byPrinting: new Map(), byName: new Map() };
  for (const row of rows) {
    const printing = printingKey(String(row._id.setCode ?? ""), String(row._id.collectorNumber ?? ""));
    counts.byPrinting.set(printing, (counts.byPrinting.get(printing) ?? 0) + row.n);
    const name = nameKey(String(row._id.name ?? ""));
    counts.byName.set(name, (counts.byName.get(name) ?? 0) + row.n);
  }
  return counts;
}

export type QuickAddRequest = SetFillOptions & {
  setCode: string;
  language?: CollectionLanguage;
  foil: boolean;
};

export type QuickAddResult = Omit<SetFillPlan, "entries"> & { batchId?: string };

/** Plafond d'exemplaires d'un seul ajout : de quoi couvrir un set maître en 20 exemplaires. */
const MAX_QUICK_ADD_COPIES = 20_000;

export class QuickAddError extends Error {}

/**
 * Calcule l'ajout d'une extension, et l'écrit sauf en `dryRun`. Rien n'est
 * écrit si l'extension est inconnue du catalogue du jeu.
 */
export async function quickAddSet(
  game: Game,
  userId: string,
  request: QuickAddRequest,
  { dryRun }: { dryRun: boolean }
): Promise<QuickAddResult> {
  const context = await buildCollectionFormatContext(game);
  const printings = setPrintings(context.catalog, request.setCode);
  if (printings.length === 0) {
    throw new QuickAddError(`Extension inconnue : « ${request.setCode} ».`);
  }

  const user = new ObjectId(userId);
  // Le mode « ajouter » ne regarde pas ce qu'on possède : inutile de le lire.
  const owned =
    request.mode === "fill"
      ? await ownedCounts(user, printings[0].setCode, [...new Set(printings.map((card) => card.name))])
      : undefined;
  const plan = planSetFill(printings, request, owned);
  const { entries, ...summary } = plan;

  if (summary.copies > MAX_QUICK_ADD_COPIES) {
    throw new QuickAddError(`Cet ajout dépasserait ${MAX_QUICK_ADD_COPIES} exemplaires.`);
  }
  if (dryRun || summary.copies === 0) return summary;

  const batchId = new ObjectId();
  const documents = entries.flatMap((entry) =>
    copyDocuments(
      {
        card: entry.card,
        quantity: entry.quantity,
        // Une carte qui n'existe qu'en foil le reste, quoi qu'on ait coché.
        foil: request.foil || entry.card.foil === true,
        ...(request.language ? { language: request.language } : {}),
      },
      user,
      batchId
    )
  );
  await db.collection("collection-cards").insertMany(documents);
  return { ...summary, batchId: batchId.toHexString() };
}

/**
 * Retire un lot : seuls ses exemplaires partent, et les annonces de vente qui
 * s'appuyaient sur eux avec. Renvoie le nombre d'exemplaires retirés.
 */
export async function removeCollectionBatch(userId: string, batchId: string): Promise<number> {
  if (!ObjectId.isValid(batchId)) return 0;
  const filter = { userId: new ObjectId(userId), batchId: new ObjectId(batchId) };
  const entries = await db.collection("collection-cards").find(filter, { projection: { _id: 1 } }).toArray();
  if (entries.length === 0) return 0;
  await db.collection("collection-cards").deleteMany(filter);
  await removeSellListItemsByCollectionEntryIds(entries.map((entry) => entry._id));
  return entries.length;
}

/**
 * Les exemplaires d'un jeu dans la collection personnelle. `collection-cards`
 * ne porte pas le jeu : il se lit sur la carte du catalogue, comme à l'export.
 */
async function gameCopies(userId: ObjectId, gameId: string): Promise<{ _id: ObjectId; fromBoosterId?: ObjectId }[]> {
  return db
    .collection("collection-cards")
    .aggregate<{ _id: ObjectId; fromBoosterId?: ObjectId }>([
      { $match: { userId } },
      {
        $lookup: {
          from: "cards",
          let: { cid: "$cardId" },
          pipeline: [{ $match: { $expr: { $eq: ["$id", "$$cid"] } } }, { $limit: 1 }, { $project: { _id: 0, gameId: 1 } }],
          as: "c",
        },
      },
      { $match: { "c.0.gameId": new ObjectId(gameId) } },
      { $project: { _id: 1, fromBoosterId: 1 } },
    ])
    .toArray();
}

/** Nombre d'exemplaires d'un jeu, annoncé avant de remplacer la collection par un fichier. */
export async function countGameCopies(userId: string, gameId: string): Promise<number> {
  return (await gameCopies(new ObjectId(userId), gameId)).length;
}

/**
 * Écrit un import. En mode « remplacer », les exemplaires du jeu sont d'abord
 * retirés — et avec eux leurs annonces de vente ; les boosters dont ils
 * venaient redeviennent « pas encore ajoutés à la collection », pour qu'on
 * puisse les y remettre. Les exemplaires des autres jeux ne sont pas touchés.
 */
export async function writeImport(
  userId: string,
  gameId: string,
  documents: Record<string, unknown>[],
  { replace }: { replace: boolean }
): Promise<{ removed: number }> {
  const user = new ObjectId(userId);
  let removed = 0;

  if (replace) {
    const existing = await gameCopies(user, gameId);
    const ids = existing.map((copy) => copy._id);
    if (ids.length > 0) {
      await db.collection("collection-cards").deleteMany({ _id: { $in: ids }, userId: user });
      await removeSellListItemsByCollectionEntryIds(ids);
      const boosterIds = [
        ...new Map(
          existing
            .map((copy) => copy.fromBoosterId)
            .filter((id): id is ObjectId => id instanceof ObjectId)
            .map((id) => [id.toHexString(), id])
        ).values(),
      ];
      if (boosterIds.length > 0) {
        await db
          .collection("boosters")
          .updateMany({ _id: { $in: boosterIds }, userId: user }, { $set: { addedToCollection: false } });
      }
    }
    removed = ids.length;
  }

  if (documents.length > 0) {
    await db.collection("collection-cards").insertMany(documents);
  }
  return { removed };
}
