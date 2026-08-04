import 'server-only';

import {randomUUID} from "node:crypto";
import db from "@/lib/mongodb";
import {ObjectId, WithId} from "mongodb";

const COLLECTION_NAME = "game-exports";
const LOCKS_COLLECTION_NAME = "game-export-locks";

/**
 * Durée au-delà de laquelle un verrou est tenu pour abandonné. Une fonction
 * tuée en cours de génération (timeout, redéploiement) ne libère pas le sien :
 * sans péremption, le jeu ne serait plus jamais exporté.
 */
export const GAME_EXPORT_LOCK_MAX_AGE_MS = 10 * 60 * 1000;

// `createIndex` est idempotent : la promesse est créée une fois par instance et
// attendue avant les écritures qui en dépendent. L'unicité sur `gameId` est ce
// qui rend la prise de verrou atomique — c'est l'erreur de clé dupliquée qui
// signale qu'une génération est déjà en cours.
const gameExportIndexesReady = db
  .collection(LOCKS_COLLECTION_NAME)
  .createIndex({gameId: 1}, {unique: true})
  .catch((error) => {
    console.error("Impossible de créer l'index des verrous d'export:", error);
  });

export type GameExport = {
  id: string;
  gameId: string;
  url: string;
  pathname: string;
  size: number;
  generatedAt: Date;
};

type GameExportDb = {
  gameId: ObjectId;
  url: string;
  pathname: string;
  size: number;
  generatedAt: Date;
};

function toGameExport(doc: WithId<GameExportDb>): GameExport {
  return {
    id: doc._id.toString(),
    gameId: doc.gameId.toString(),
    url: doc.url,
    pathname: doc.pathname,
    size: doc.size,
    generatedAt: doc.generatedAt,
  };
}

type GameExportLockDb = {
  gameId: ObjectId;
  startedAt: Date;
  /** Propriétaire du verrou : seul lui peut le relâcher. */
  token: string;
};

export type GameExportLock =
  /** Verrou pris : la génération peut commencer, `token` sert à le relâcher. */
  | {acquired: true; token: string}
  /** Verrou déjà tenu : une génération est en cours depuis `startedAt`. */
  | {acquired: false; startedAt: Date};

/** Une écriture a violé un index unique. */
function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as {code?: number}).code === 11000;
}

/**
 * Prend le verrou de génération d'un jeu, ou renvoie depuis quand il est tenu.
 *
 * L'atomicité vient de l'index unique sur `gameId` : deux fonctions qui
 * démarrent en même temps tentent la même insertion, et une seule la réussit.
 * Un verrou plus vieux que `maxAgeMs` est considéré comme abandonné et repris,
 * ce qui évite qu'une génération interrompue bloque le jeu pour toujours.
 */
export async function acquireGameExportLock(
  gameId: string,
  maxAgeMs: number = GAME_EXPORT_LOCK_MAX_AGE_MS
): Promise<GameExportLock> {
  await gameExportIndexesReady;

  const _id = new ObjectId(gameId);
  const now = new Date();
  const staleBefore = new Date(now.getTime() - maxAgeMs);
  const token = randomUUID();

  try {
    // Le filtre ne retient que les verrous périmés : sur un verrou frais il ne
    // correspond à rien, l'upsert tente l'insertion, et l'index unique la
    // refuse. Sans verrou du tout, l'insertion passe — le document inséré tient
    // son `gameId` de l'égalité du filtre, inutile de le répéter en
    // `$setOnInsert` où il entrerait en conflit avec elle.
    await db
      .collection<GameExportLockDb>(LOCKS_COLLECTION_NAME)
      .updateOne(
        {gameId: _id, startedAt: {$lte: staleBefore}},
        {$set: {startedAt: now, token}},
        {upsert: true}
      );
    return {acquired: true, token};
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const held = await db
      .collection<GameExportLockDb>(LOCKS_COLLECTION_NAME)
      .findOne({gameId: _id});
    // Le verrou a pu être relâché entre l'échec et cette lecture. L'appelant
    // sera invité à réessayer, ce qu'il aurait fait de toute façon : mieux vaut
    // une attente inutile qu'une seconde génération lancée en parallèle.
    return {acquired: false, startedAt: held?.startedAt ?? now};
  }
}

/**
 * Relâche le verrou, à condition qu'il soit toujours le nôtre : un verrou
 * périmé repris par une autre génération ne doit pas être effacé par celle qui
 * l'avait laissé traîner.
 */
export async function releaseGameExportLock(gameId: string, token: string): Promise<void> {
  await db
    .collection<GameExportLockDb>(LOCKS_COLLECTION_NAME)
    .deleteOne({gameId: new ObjectId(gameId), token});
}

export async function getRecentGameExport(gameId: string, maxAgeMs: number): Promise<GameExport | null> {
  const doc = await db
    .collection<GameExportDb>(COLLECTION_NAME)
    .findOne(
      {gameId: new ObjectId(gameId), generatedAt: {$gte: new Date(Date.now() - maxAgeMs)}},
      {sort: {generatedAt: -1}}
    );

  return doc ? toGameExport(doc) : null;
}

/**
 * Latest export for every game that has one, most recent first.
 */
export async function getLatestGameExports(): Promise<GameExport[]> {
  const docs = await db
    .collection<GameExportDb>(COLLECTION_NAME)
    .aggregate<WithId<GameExportDb>>([
      {$sort: {generatedAt: -1}},
      {$group: {_id: '$gameId', doc: {$first: '$$ROOT'}}},
      {$replaceRoot: {newRoot: '$doc'}},
      {$sort: {generatedAt: -1}},
    ])
    .toArray();

  return docs.map(toGameExport);
}

export async function getGameExportById(id: string): Promise<GameExport | null> {
  if (!ObjectId.isValid(id)) return null;

  const doc = await db.collection<GameExportDb>(COLLECTION_NAME).findOne({_id: new ObjectId(id)});
  return doc ? toGameExport(doc) : null;
}

export async function deleteGameExport(id: string): Promise<boolean> {
  const result = await db.collection<GameExportDb>(COLLECTION_NAME).deleteOne({_id: new ObjectId(id)});
  return result.deletedCount > 0;
}

export async function createGameExport(data: {
  gameId: string;
  url: string;
  pathname: string;
  size: number;
  generatedAt: Date;
}): Promise<GameExport> {
  const doc: GameExportDb = {
    gameId: new ObjectId(data.gameId),
    url: data.url,
    pathname: data.pathname,
    size: data.size,
    generatedAt: data.generatedAt,
  };

  const result = await db.collection<GameExportDb>(COLLECTION_NAME).insertOne(doc);

  return toGameExport({...doc, _id: result.insertedId});
}
