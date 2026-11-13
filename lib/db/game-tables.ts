import { DateTime } from "luxon";
import type { Filter } from "mongodb";

import db from "@/lib/mongodb";
import type { GameTable, GameTableSeat } from "@/lib/types/GameTable";

/**
 * Les tables de jeu en ligne : un document par table. Les règles (qui rejoint,
 * qui lance) sont dans `lib/engine/tables.ts` ; ce module ne fait qu'écrire et
 * lire.
 *
 * Index : `lib/db/indexes/users.ts`, section tables de jeu.
 */
export const GAME_TABLES_COLLECTION = "gameTables";

type GameTableDoc = GameTable & { memberIds: string[]; purgeAt?: Date };

const now = () => DateTime.utc().toISO();

const collection = db.collection<GameTableDoc>(GAME_TABLES_COLLECTION);

function toTable(doc: GameTableDoc): GameTable {
  return {
    id: doc.id,
    gameSlug: doc.gameSlug,
    mode: doc.mode,
    hostId: doc.hostId,
    status: doc.status,
    seats: doc.seats,
    createdAt: doc.createdAt,
    ...(doc.engineId ? { engineId: doc.engineId } : {}),
    ...(doc.startedAt ? { startedAt: doc.startedAt } : {}),
    ...(doc.finishedAt ? { finishedAt: doc.finishedAt } : {}),
    ...(doc.result ? { result: doc.result } : {}),
  };
}

function members(seats: GameTableSeat[]): string[] {
  return seats.flatMap((seat) => (seat.userId ? [seat.userId] : []));
}

/** Faux si le code est déjà pris : l'appelant en tire un autre. */
export async function insertGameTable(table: GameTable): Promise<boolean> {
  try {
    await collection.insertOne({ ...table, memberIds: members(table.seats) });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export async function getGameTable(id: string): Promise<GameTable | null> {
  const doc = await collection.findOne({ id }, { projection: { _id: 0 } });
  return doc ? toTable(doc) : null;
}

/**
 * Assoit quelqu'un à une table encore en attente, en une seule écriture : la
 * place n'est prise que s'il en reste une (`capacity`), si la personne n'est
 * pas déjà assise et, pour un robot, si son nom est libre. Deux arrivées
 * simultanées ne peuvent ni dépasser la capacité ni s'écraser l'une l'autre.
 */
export async function addGameTableSeat(id: string, capacity: number, seat: GameTableSeat): Promise<boolean> {
  const filter: Filter<GameTableDoc> = {
    id,
    status: "waiting",
    [`seats.${capacity - 1}`]: { $exists: false },
    ...(seat.userId ? { memberIds: { $ne: seat.userId } } : { "seats.name": { $ne: seat.name } }),
  };
  const result = await collection.updateOne(filter, {
    $push: { seats: seat },
    ...(seat.userId ? { $addToSet: { memberIds: seat.userId } } : {}),
  });
  return result.modifiedCount === 1;
}

/** Libère le siège d'une personne, ou celui d'un robot désigné par son nom. */
export async function removeGameTableSeat(id: string, target: { userId: string } | { bot: string }): Promise<boolean> {
  const result =
    "userId" in target
      ? await collection.updateOne(
          { id, status: "waiting" },
          { $pull: { seats: { userId: target.userId }, memberIds: target.userId } },
        )
      : await collection.updateOne(
          { id, status: "waiting" },
          { $pull: { seats: { name: { $eq: target.bot }, bot: { $exists: true } } } },
        );
  return result.modifiedCount === 1;
}

/**
 * Passe la table « en cours » et rend la table telle qu'elle est lancée : les
 * sièges envoyés au serveur de parties sont ceux de ce document, pas ceux d'une
 * lecture antérieure. `null` si la table n'est plus en attente, plus complète,
 * ou si l'appelant n'en est pas l'hôte.
 */
export async function claimGameTableStart(
  id: string,
  hostId: string,
  players: number,
  engineId: string,
): Promise<GameTable | null> {
  const doc = await collection.findOneAndUpdate(
    { id, hostId, status: "waiting", seats: { $size: players } },
    { $set: { status: "playing", startedAt: now(), engineId } },
    { returnDocument: "after", projection: { _id: 0 } },
  );
  return doc ? toTable(doc) : null;
}

/** Remet en attente une table dont ce lancement-là a échoué côté serveur de parties. */
export async function revertGameTableStart(id: string, engineId: string): Promise<void> {
  await collection.updateOne(
    { id, engineId, status: "playing" },
    { $set: { status: "waiting" }, $unset: { startedAt: "", engineId: "" } },
  );
}

/** Les tables annulées sont effacées au bout d'une semaine (index à durée de vie sur `purgeAt`). */
const CANCELLED_DAYS = 7;

function cancellation() {
  return {
    status: "cancelled" as const,
    finishedAt: now(),
    purgeAt: DateTime.utc().plus({ days: CANCELLED_DAYS }).toJSDate(),
  };
}

export async function cancelGameTable(id: string): Promise<boolean> {
  const result = await collection.updateOne({ id, status: "waiting" }, { $set: cancellation() });
  return result.modifiedCount === 1;
}

/** Une personne n'a qu'une table en attente à la fois : en ouvrir une autre ferme les précédentes. */
export async function cancelWaitingGameTablesOf(hostId: string): Promise<void> {
  await collection.updateMany({ hostId, status: "waiting" }, { $set: cancellation() });
}

/** Une partie que le serveur de parties ne connaît plus : la table ne peut plus se finir. */
export async function abandonGameTable(id: string, engineId: string): Promise<boolean> {
  const result = await collection.updateOne({ id, engineId, status: "playing" }, { $set: cancellation() });
  return result.modifiedCount === 1;
}

/**
 * Enregistre la fin d'une partie. `engineId` est la partie du serveur de
 * parties : le résultat d'un lancement abandonné ne finit pas la table.
 */
export async function finishGameTable(
  id: string,
  engineId: string,
  result: NonNullable<GameTable["result"]>,
): Promise<boolean> {
  const outcome = await collection.updateOne(
    { id, engineId, status: "playing" },
    { $set: { status: "finished", finishedAt: now(), result } },
  );
  return outcome.modifiedCount === 1;
}

/** Les tables d'une personne à un jeu, les plus récentes d'abord. */
export async function listGameTablesOf(userId: string, gameSlug: string, limit = 20): Promise<GameTable[]> {
  const docs = await collection
    .find({ memberIds: userId, gameSlug, status: { $ne: "cancelled" } }, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toTable);
}
