import { getDb } from "@/lib/mongodb";
import { GameMatch } from "@/lib/types/GameMatch";
import { ObjectId, WithId, Document } from "mongodb";

const COLLECTION_NAME = "gameMatches";

// Type pour une partie dans MongoDB (avec _id)
export type GameMatchDocument = Omit<GameMatch, "id" | "playedAt" | "createdAt"> & {
  _id: ObjectId;
  playedAt: Date;
  createdAt: Date;
};

// Convertir un document MongoDB en GameMatch
function toGameMatch(doc: WithId<Document>): GameMatch {
  return {
    id: doc._id.toString(),
    gameId: doc.gameId,
    playedAt: doc.playedAt,
    lairId: doc.lairId,
    players: doc.players,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}

// Convertir un GameMatch en document MongoDB (sans id)
function toDocument(gameMatch: Omit<GameMatch, "id" | "createdAt">): Omit<GameMatchDocument, "_id" | "createdAt"> {
  return {
    gameId: gameMatch.gameId,
    playedAt: gameMatch.playedAt,
    lairId: gameMatch.lairId,
    players: gameMatch.players,
    createdBy: gameMatch.createdBy,
  };
}

export async function createGameMatch(gameMatch: Omit<GameMatch, "id" | "createdAt">): Promise<GameMatch> {
  const db = await getDb();
  const doc = {
    ...toDocument(gameMatch),
    createdAt: new Date(),
  };
  const result = await db.collection(COLLECTION_NAME).insertOne(doc);
  
  return {
    id: result.insertedId.toString(),
    ...gameMatch,
    createdAt: doc.createdAt,
  };
}

export async function getGameMatchById(id: string): Promise<GameMatch | null> {
  const db = await getDb();
  const match = await db.collection<GameMatchDocument>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
  return match ? toGameMatch(match) : null;
}

export interface GetGameMatchesFilters {
  userId?: string;
  gameId?: string;
  lairId?: string;
  playerUserIds?: string[];
}

export async function getGameMatches(filters: GetGameMatchesFilters = {}): Promise<GameMatch[]> {
  const db = await getDb();
  const query: {
    "players.userId"?: string | { $in: string[] };
    gameId?: string;
    lairId?: string;
  } = {};
  
  // Filtrer par joueur participant
  if (filters.userId) {
    query["players.userId"] = filters.userId;
  }
  
  // Filtrer par jeu
  if (filters.gameId) {
    query.gameId = filters.gameId;
  }
  
  // Filtrer par lair
  if (filters.lairId) {
    query.lairId = filters.lairId;
  }
  
  // Filtrer par liste de joueurs (toutes les parties contenant au moins l'un de ces joueurs)
  if (filters.playerUserIds && filters.playerUserIds.length > 0) {
    query["players.userId"] = { $in: filters.playerUserIds };
  }
  
  const matches = await db
    .collection<GameMatchDocument>(COLLECTION_NAME)
    .find(query)
    .sort({ playedAt: -1 }) // Trier par date de partie décroissante
    .toArray();
  
  return matches.map(toGameMatch);
}

export async function getGameMatchesByUser(userId: string): Promise<GameMatch[]> {
  return getGameMatches({ userId });
}

export async function updateGameMatch(id: string, gameMatch: Partial<Omit<GameMatch, "id" | "createdAt" | "createdBy">>): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection<GameMatchDocument>(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(id) },
    { $set: gameMatch }
  );
  
  return result.modifiedCount > 0;
}

export async function deleteGameMatch(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection<GameMatchDocument>(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
