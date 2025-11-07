import db from "@/lib/mongodb";
import { User } from "@/lib/types/User";
import { WithId, Document, ObjectId } from "mongodb";

const COLLECTION_NAME = "user";

// Convertir un document MongoDB en User
function toUser(doc: WithId<Document>): User {
  return {
    id: doc.id || doc._id.toString(),
    username: doc.name || doc.username || "",
    displayName: doc.displayName || undefined,
    discriminator: doc.discriminator || undefined,
    email: doc.email,
    discordId: doc.discordId || "",
    avatar: doc.image || doc.avatar || "",
    lairs: doc.lairs || [],
    games: doc.games || [],
  };
}

export async function getUserById(id: string): Promise<User | null> {
  
  const user = await db.collection(COLLECTION_NAME).findOne({ _id: ObjectId.createFromHexString(id) });
  return user ? toUser(user) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  
  const user = await db.collection(COLLECTION_NAME).findOne({ email: email.toLowerCase() });
  return user ? toUser(user) : null;
}

export async function searchUsersByUsername(searchTerm: string): Promise<User[]> {
  
  const users = await db
    .collection(COLLECTION_NAME)
    .find({
      $or: [
        { username: { $regex: searchTerm, $options: "i" } },
        { displayName: { $regex: searchTerm, $options: "i" } },
      ],
    })
    .limit(10)
    .toArray();
  return users.map(toUser);
}

export async function getUserByUsernameAndDiscriminator(
  displayName: string,
  discriminator: string
): Promise<User | null> {
  
  const user = await db.collection(COLLECTION_NAME).findOne({
    displayName,
    discriminator,
  });
  return user ? toUser(user) : null;
}

export async function updateUserGames(userId: string, games: string[]): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { games } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function addGameToUser(userId: string, gameId: string): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $addToSet: { games: gameId } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function removeGameFromUser(userId: string, gameId: string): Promise<boolean> {
  
  const result = await db.collection<User>(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $pull: { games: gameId } }
  );
  
  return result.modifiedCount > 0;
}

export async function updateUserLairs(userId: string, lairs: string[]): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { lairs } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function addLairToUser(userId: string, lairId: string): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $addToSet: { lairs: lairId } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function removeLairFromUser(userId: string, lairId: string): Promise<boolean> {
  
  const result = await db.collection<User>(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $pull: { lairs: lairId } }
  );
  
  return result.modifiedCount > 0;
}

/**
 * Met à jour le nom d'utilisateur personnalisé (displayName) et génère un discriminateur si nécessaire
 * @param userId L'ID de l'utilisateur
 * @param displayName Le nouveau nom d'utilisateur personnalisé
 * @param discriminator Le discriminateur (optionnel, sera généré s'il n'existe pas)
 * @returns true si la mise à jour a réussi, false sinon
 */
export async function updateUserDisplayName(
  userId: string,
  displayName: string,
  discriminator?: string
): Promise<boolean> {
  
  
  const updateData: { displayName: string; discriminator?: string } = {
    displayName,
  };
  
  // Ajouter le discriminateur seulement s'il est fourni
  if (discriminator) {
    updateData.discriminator = discriminator;
  }
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: updateData }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

/**
 * Récupère le discriminateur d'un utilisateur
 * @param userId L'ID de l'utilisateur
 * @returns Le discriminateur ou null si non trouvé
 */
export async function getUserDiscriminator(userId: string): Promise<string | null> {
  
  const user = await db.collection(COLLECTION_NAME).findOne(
    { _id: ObjectId.createFromHexString(userId) },
    { projection: { discriminator: 1 } }
  );
  
  return user?.discriminator || null;
}

