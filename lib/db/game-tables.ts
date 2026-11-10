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

type GameTableDoc = GameTable & { memberIds: string[] };

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
    ...(doc.startedAt ? { startedAt: doc.startedAt } : {}),
    ...(doc.finishedAt ? { finishedAt: doc.finishedAt } : {}),
    ...(doc.result ? { result: doc.result } : {}),
  };
}

function members(seats: GameTableSeat[]): string[] {
  return seats.flatMap((seat) => (seat.userId ? [seat.userId] : []));
}

export async function insertGameTable(table: GameTable): Promise<void> {
  await collection.insertOne({ ...table, memberIds: members(table.seats) });
}

export async function getGameTable(id: string): Promise<GameTable | null> {
  const doc = await collection.findOne({ id }, { projection: { _id: 0 } });
  return doc ? toTable(doc) : null;
}

/**
 * Remplace les sièges d'une table encore en attente. Le filtre sur l'ancien
 * nombre de sièges évite que deux arrivées simultanées prennent la même place :
 * la seconde ne trouve plus la table dans l'état qu'elle a lu, et échoue.
 */
export async function replaceWaitingSeats(id: string, expectedSeats: number, seats: GameTableSeat[]): Promise<boolean> {
  const result = await collection.updateOne(
    { id, status: "waiting", seats: { $size: expectedSeats } },
    { $set: { seats, memberIds: members(seats) } },
  );
  return result.modifiedCount === 1;
}

export async function markGameTableStarted(id: string): Promise<boolean> {
  const result = await collection.updateOne(
    { id, status: "waiting" },
    { $set: { status: "playing", startedAt: new Date().toISOString() } },
  );
  return result.modifiedCount === 1;
}

/** Remet en attente une table dont le lancement a échoué côté serveur de parties. */
export async function revertGameTableStart(id: string): Promise<void> {
  await collection.updateOne({ id, status: "playing" }, { $set: { status: "waiting" }, $unset: { startedAt: "" } });
}

export async function cancelGameTable(id: string): Promise<boolean> {
  const result = await collection.updateOne(
    { id, status: "waiting" },
    { $set: { status: "cancelled", finishedAt: new Date().toISOString() } },
  );
  return result.modifiedCount === 1;
}

export async function finishGameTable(id: string, result: NonNullable<GameTable["result"]>): Promise<boolean> {
  const outcome = await collection.updateOne(
    { id, status: "playing" },
    { $set: { status: "finished", finishedAt: new Date().toISOString(), result } },
  );
  return outcome.modifiedCount === 1;
}

/** Les tables d'une personne, les plus récentes d'abord. */
export async function listGameTablesOf(userId: string, limit = 20): Promise<GameTable[]> {
  const docs = await collection
    .find({ memberIds: userId, status: { $ne: "cancelled" } }, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toTable);
}
