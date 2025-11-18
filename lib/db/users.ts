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
    isPublicProfile: doc.isPublicProfile || false,
    description: doc.description || undefined,
    website: doc.website || undefined,
    socialLinks: doc.socialLinks || [],
    profileImage: doc.profileImage || undefined,
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
  }, { collation: { locale: 'en', strength: 2 } });
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

/**
 * Met à jour la visibilité du profil de l'utilisateur
 * @param userId L'ID de l'utilisateur
 * @param isPublicProfile true pour rendre le profil public, false pour privé
 * @returns true si la mise à jour a réussi, false sinon
 */
export async function updateUserProfileVisibility(
  userId: string,
  isPublicProfile: boolean
): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { isPublicProfile } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

/**
 * Récupère un utilisateur par son userTag (displayName#discriminator) ou son ID
 * @param userTagOrId Le userTag ou l'ID de l'utilisateur
 * @returns L'utilisateur ou null si non trouvé
 */
export async function getUserByTagOrId(userTagOrId: string): Promise<User | null> {
  
  // Vérifier si c'est un ID MongoDB valide
  if (ObjectId.isValid(userTagOrId) && userTagOrId.length === 24) {
    return getUserById(userTagOrId);
  }
  
  // Sinon, considérer que c'est un userTag (displayName#discriminator)
  const parts = userTagOrId.split('#');
  if (parts.length === 2) {
    const [displayName, discriminator] = parts;
    return getUserByUsernameAndDiscriminator(displayName, discriminator);
  }
  
  return null;
}

/**
 * Met à jour les informations publiques du profil
 * @param userId L'ID de l'utilisateur
 * @param description La description du profil
 * @param website Le site web
 * @param socialLinks Les liens vers les réseaux sociaux
 * @returns true si la mise à jour a réussi, false sinon
 */
export async function updateUserProfileInfo(
  userId: string,
  data: {
    description?: string;
    website?: string;
    socialLinks?: string[];
  }
): Promise<boolean> {
  
  const updateData: Record<string, unknown> = {};
  
  if (data.description !== undefined) {
    updateData.description = data.description || null;
  }
  if (data.website !== undefined) {
    updateData.website = data.website || null;
  }
  if (data.socialLinks !== undefined) {
    updateData.socialLinks = data.socialLinks;
  }
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: updateData }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

/**
 * Met à jour l'image de profil de l'utilisateur
 * @param userId L'ID de l'utilisateur
 * @param profileImage L'URL de l'image de profil
 * @returns true si la mise à jour a réussi, false sinon
 */
export async function updateUserProfileImage(
  userId: string,
  profileImage: string
): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { profileImage } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}
