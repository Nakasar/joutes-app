import db from "@/lib/mongodb";
import { User } from "@/lib/types/User";
import { WithId, Document, ObjectId } from "mongodb";
import { generateFriendCode } from "@/lib/utils/friend-codes";

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
    friends: doc.friends || [],
    friendCode: doc.friendCode || undefined,
    isPublicProfile: doc.isPublicProfile || false,
    description: doc.description || undefined,
    website: doc.website || undefined,
    socialLinks: doc.socialLinks || [],
    profileImage: doc.profileImage || undefined,
    location: doc.location ? {
      latitude: doc.location.latitude,
      longitude: doc.location.longitude,
    } : undefined,
  };
}

export async function getUserById(id: string): Promise<User | null> {
  if (!id) {
    return null;
  }

  const user = await db.collection(COLLECTION_NAME).findOne({ _id: ObjectId.createFromHexString(id) });
  return user ? toUser(user) : null;
}

export async function getUsersByIds(userIds: string[]): Promise<User[]> {
  if (!userIds || userIds.length === 0) {
    return [];
  }

  const validIds = userIds.filter((id) => ObjectId.isValid(id));
  if (validIds.length === 0) {
    return [];
  }

  const objectIds = validIds.map((id) => ObjectId.createFromHexString(id));
  const users = await db
    .collection(COLLECTION_NAME)
    .find({ _id: { $in: objectIds } })
    .toArray();

  return users.map(toUser);
}

export async function getUserByEmail(email: string): Promise<User | null> {

  const user = await db.collection(COLLECTION_NAME).findOne({ email: email.toLowerCase() });
  return user ? toUser(user) : null;
}

// Génère un discriminant à 4 chiffres unique pour un displayName donné.
async function generateUniqueDiscriminator(displayName: string): Promise<string> {
  const collection = db.collection(COLLECTION_NAME);
  for (let i = 0; i < 10; i++) {
    const discriminator = Math.floor(1000 + Math.random() * 9000).toString();
    const existing = await collection.findOne(
      { displayName, discriminator },
      { collation: { locale: "en", strength: 2 } }
    );
    if (!existing) {
      return discriminator;
    }
  }
  return Math.floor(10000 + Math.random() * 90000).toString();
}

/**
 * Crée un compte utilisateur « invité » à partir d'un email (ex: joueur ajouté
 * à un tournoi qui n'a pas encore de compte). Le nom d'utilisateur par défaut
 * est dérivé de la partie locale de l'email. `createdVia` trace l'origine.
 */
export async function createInvitedUserByEmail(
  email: string,
  createdVia: string
): Promise<User> {
  const normalizedEmail = email.toLowerCase();
  const username = (normalizedEmail.split("@")[0] || "joueur").slice(0, 100);
  const discriminator = await generateUniqueDiscriminator(username);

  const newUser = {
    username,
    displayName: username,
    discriminator,
    email: normalizedEmail,
    discordId: "",
    avatar: "",
    lairs: [],
    games: [],
    isPublicProfile: false,
    createdAt: new Date().toISOString(),
    createdVia,
  };

  const result = await db.collection(COLLECTION_NAME).insertOne(newUser);
  return toUser({ ...newUser, _id: result.insertedId });
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

/**
 * Récupère un utilisateur par son nom d'utilisateur (username, ou tag displayName#discriminator)
 * @param username Le nom d'utilisateur ou tag renseigné
 * @returns L'utilisateur ou null si non trouvé
 */
export async function getUserByUsername(username: string): Promise<User | null> {
  if (!username) {
    return null;
  }

  const parts = username.split('#');
  if (parts.length === 2 && parts[0] && parts[1]) {
    const byTag = await getUserByUsernameAndDiscriminator(parts[0], parts[1]);
    if (byTag) {
      return byTag;
    }
  }

  const user = await db.collection(COLLECTION_NAME).findOne({
    $or: [{ name: username }, { username }],
  }, { collation: { locale: 'en', strength: 2 } });
  return user ? toUser(user) : null;
}

/**
 * Récupère un utilisateur par son code ami (partagé via QR code).
 */
export async function getUserByFriendCode(code: string): Promise<User | null> {
  if (!code) {
    return null;
  }

  const user = await db.collection(COLLECTION_NAME).findOne({ friendCode: code });
  return user ? toUser(user) : null;
}

const MAX_FRIEND_CODE_ATTEMPTS = 5;

/**
 * Récupère le code ami de l'utilisateur, ou lui en génère un s'il n'en a pas encore.
 */
export async function getOrCreateFriendCode(userId: string): Promise<string> {
  const objectId = ObjectId.createFromHexString(userId);
  const current = await db.collection(COLLECTION_NAME).findOne(
    { _id: objectId },
    { projection: { friendCode: 1 } }
  );
  if (current?.friendCode) {
    return current.friendCode;
  }

  for (let attempt = 0; attempt < MAX_FRIEND_CODE_ATTEMPTS; attempt++) {
    const code = generateFriendCode();
    const collision = await db.collection(COLLECTION_NAME).findOne(
      { friendCode: code },
      { projection: { _id: 1 } }
    );
    if (collision) {
      continue;
    }

    await db.collection(COLLECTION_NAME).updateOne({ _id: objectId }, { $set: { friendCode: code } });
    return code;
  }

  throw new Error("Impossible de générer un code ami unique");
}

/** Doit être appelée au moins une fois (ex. script de setup) pour garantir l'unicité des codes ami. */
export async function createUserFriendCodeIndex() {
  await db.collection(COLLECTION_NAME).createIndex({ friendCode: 1 }, { unique: true, sparse: true });
}

export type PublicUser = Pick<User, "id" | "username" | "displayName" | "discriminator" | "avatar">;

/**
 * Ne conserve que les champs publics d'un utilisateur, pour éviter d'exposer
 * des informations sensibles (email, discordId...) à d'autres utilisateurs.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    discriminator: user.discriminator,
    avatar: user.avatar,
  };
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

export async function updateUserLocation(
  userId: string,
  latitude: number | null,
  longitude: number | null
): Promise<boolean> {
  
  let updateOperation;
  
  if (latitude === null || longitude === null) {
    // Supprimer la localisation
    updateOperation = { $unset: { location: "" } };
  } else {
    // Mettre à jour ou créer la localisation
    updateOperation = { 
      $set: { 
        location: {
          latitude,
          longitude,
        }
      } 
    };
  }
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    updateOperation
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

/**
 * Get all users who follow a specific lair
 * @param lairId - The lair's ID
 * @returns Array of users following the lair
 */
export async function getUsersFollowingLair(lairId: string): Promise<User[]> {
  
  const users = await db.collection(COLLECTION_NAME).find({
    lairs: lairId
  }).toArray();
  
  return users.map(toUser);
}

