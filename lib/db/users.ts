import { getDb } from "@/lib/mongodb";
import { User } from "@/lib/types/User";
import { WithId, Document, ObjectId } from "mongodb";

const COLLECTION_NAME = "user";

// Convertir un document MongoDB en User
function toUser(doc: WithId<Document>): User {
  return {
    id: doc.id || doc._id.toString(),
    username: doc.name || doc.username || "",
    email: doc.email,
    discordId: doc.discordId || "",
    avatar: doc.image || doc.avatar || "",
    lairs: doc.lairs || [],
    games: doc.games || [],
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  const user = await db.collection(COLLECTION_NAME).findOne({ _id: ObjectId.createFromHexString(id) });
  return user ? toUser(user) : null;
}

export async function updateUserGames(userId: string, games: string[]): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { games } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function addGameToUser(userId: string, gameId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $addToSet: { games: gameId } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function removeGameFromUser(userId: string, gameId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $pull: { games: gameId } } as any
  );
  
  return result.modifiedCount > 0;
}

export async function updateUserLairs(userId: string, lairs: string[]): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { lairs } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function addLairToUser(userId: string, lairId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $addToSet: { lairs: lairId } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function removeLairFromUser(userId: string, lairId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $pull: { lairs: lairId } } as any
  );
  
  return result.modifiedCount > 0;
}
