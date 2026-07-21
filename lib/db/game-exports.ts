import 'server-only';

import db from "@/lib/mongodb";
import {ObjectId, WithId} from "mongodb";

const COLLECTION_NAME = "game-exports";

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
