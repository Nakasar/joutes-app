import db from "@/lib/mongodb";
import { Game } from "@/lib/types/Game";
import { ObjectId, WithId, Document } from "mongodb";

const COLLECTION_NAME = "games";

// Type pour un jeu dans MongoDB (avec _id)
export type GameDocument = Omit<Game, "id"> & { _id: ObjectId };

// Convertir un document MongoDB en Game
function toGame(doc: WithId<Document>): Game {
  return {
    id: doc._id.toString(),
    name: doc.name,
    slug: doc.slug,
    icon: doc.icon,
    banner: doc.banner,
    description: doc.description,
    type: doc.type,
  };
}

// Convertir un Game en document MongoDB (sans id)
function toDocument(game: Omit<Game, "id">): Omit<GameDocument, "_id"> {
  return {
    name: game.name,
    slug: game.slug,
    icon: game.icon,
    banner: game.banner,
    description: game.description,
    type: game.type,
  };
}

export async function getAllGames(): Promise<Game[]> {
  
  const games = await db.collection(COLLECTION_NAME).find({}).toArray();
  return games.map(toGame);
}

export async function getGameById(id: string): Promise<Game | null> {
  
  const game = await db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
  return game ? toGame(game) : null;
}

export async function createGame(game: Omit<Game, "id">): Promise<Game> {
  
  const doc = toDocument(game);
  const result = await db.collection(COLLECTION_NAME).insertOne(doc);
  
  return {
    id: result.insertedId.toString(),
    ...game,
  };
}

export async function updateGame(id: string, game: Partial<Omit<Game, "id">>): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(id) },
    { $set: game }
  );
  
  return result.modifiedCount > 0;
}

export async function deleteGame(id: string): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
