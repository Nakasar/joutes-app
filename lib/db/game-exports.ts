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
