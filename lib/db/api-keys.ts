import { getDb } from "@/lib/mongodb";
import { ApiKey } from "@/lib/types/ApiKey";
import { WithId, Document, ObjectId } from "mongodb";
import crypto from "crypto";

const COLLECTION_NAME = "api_keys";

// Convertir un document MongoDB en ApiKey
function toApiKey(doc: WithId<Document>): ApiKey {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    name: doc.name,
    description: doc.description || undefined,
    key: doc.key,
    keyPrefix: doc.keyPrefix,
    isActive: doc.isActive ?? true,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastUsedAt: doc.lastUsedAt || undefined,
    usageCount: doc.usageCount || 0,
  };
}

// Générer une clé API sécurisée
function generateApiKey(): { key: string; keyPrefix: string; hashedKey: string } {
  // Générer une clé aléatoire de 32 octets (256 bits)
  const rawKey = crypto.randomBytes(32).toString("hex");
  
  // Créer le préfixe visible pour l'utilisateur (jts_ + premiers 8 caractères)
  const keyPrefix = `jts_${rawKey.substring(0, 8)}`;
  
  // La clé complète avec le préfixe
  const key = `${keyPrefix}${rawKey.substring(8)}`;
  
  // Hacher la clé pour le stockage en base
  const hashedKey = crypto.createHash("sha256").update(key).digest("hex");
  
  return { key, keyPrefix, hashedKey };
}

// Hacher une clé API pour la comparaison
function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Créer une nouvelle clé API pour un utilisateur
 */
export async function createApiKey(
  userId: string,
  name: string,
  description?: string
): Promise<{ apiKey: ApiKey; plainKey: string }> {
  const db = await getDb();
  
  const { key, keyPrefix, hashedKey } = generateApiKey();
  const now = new Date();
  
  const apiKeyDoc = {
    userId,
    name,
    description,
    key: hashedKey,
    keyPrefix,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
  };
  
  const result = await db.collection(COLLECTION_NAME).insertOne(apiKeyDoc);
  
  const apiKey: ApiKey = {
    id: result.insertedId.toString(),
    userId,
    name,
    description,
    key: hashedKey,
    keyPrefix,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
  };
  
  return { apiKey, plainKey: key };
}

/**
 * Récupérer toutes les clés API d'un utilisateur
 */
export async function getApiKeysByUserId(userId: string): Promise<ApiKey[]> {
  const db = await getDb();
  const docs = await db
    .collection(COLLECTION_NAME)
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
  
  return docs.map(toApiKey);
}

/**
 * Récupérer une clé API par son ID
 */
export async function getApiKeyById(id: string): Promise<ApiKey | null> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION_NAME).findOne({
    _id: ObjectId.createFromHexString(id)
  });
  
  return doc ? toApiKey(doc) : null;
}

/**
 * Valider une clé API et récupérer l'utilisateur associé
 */
export async function validateApiKey(key: string): Promise<{ userId: string; apiKeyId: string } | null> {
  const db = await getDb();
  const hashedKey = hashApiKey(key);
  
  const doc = await db.collection(COLLECTION_NAME).findOne({
    key: hashedKey,
    isActive: true
  });
  
  if (!doc) {
    return null;
  }
  
  // Mettre à jour la date de dernière utilisation et le compteur d'usage
  await db.collection(COLLECTION_NAME).updateOne(
    { _id: doc._id },
    {
      $set: { lastUsedAt: new Date() },
      $inc: { usageCount: 1 }
    }
  );
  
  return {
    userId: doc.userId,
    apiKeyId: doc._id.toString()
  };
}

/**
 * Mettre à jour une clé API
 */
export async function updateApiKey(
  id: string,
  updates: {
    name?: string;
    description?: string;
    isActive?: boolean;
  }
): Promise<boolean> {
  const db = await getDb();
  
  const updateDoc: Partial<ApiKey> = {
    updatedAt: new Date(),
    ...updates
  };
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(id) },
    { $set: updateDoc }
  );
  
  return result.modifiedCount > 0;
}

/**
 * Supprimer une clé API
 */
export async function deleteApiKey(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).deleteOne({
    _id: ObjectId.createFromHexString(id)
  });
  
  return result.deletedCount > 0;
}

/**
 * Désactiver une clé API
 */
export async function deactivateApiKey(id: string): Promise<boolean> {
  return updateApiKey(id, { isActive: false });
}

/**
 * Réactiver une clé API
 */
export async function reactivateApiKey(id: string): Promise<boolean> {
  return updateApiKey(id, { isActive: true });
}

/**
 * Récupérer les statistiques d'usage d'une clé API
 */
export async function getApiKeyUsageStats(id: string): Promise<{
  usageCount: number;
  lastUsedAt?: Date;
} | null> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION_NAME).findOne(
    { _id: ObjectId.createFromHexString(id) },
    { projection: { usageCount: 1, lastUsedAt: 1 } }
  );
  
  if (!doc) {
    return null;
  }
  
  return {
    usageCount: doc.usageCount || 0,
    lastUsedAt: doc.lastUsedAt || undefined
  };
}

/**
 * Récupérer toutes les clés API d'un utilisateur (alias pour getApiKeysByUserId)
 */
export async function getUserApiKeys(userId: string): Promise<ApiKey[]> {
  return getApiKeysByUserId(userId);
}

/**
 * Révoquer (supprimer) une clé API si l'utilisateur en est propriétaire
 */
export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  const db = await getDb();
  
  // Vérifier que la clé appartient à l'utilisateur
  const existingKey = await db.collection(COLLECTION_NAME).findOne({
    _id: ObjectId.createFromHexString(keyId),
    userId: userId
  });
  
  if (!existingKey) {
    return false;
  }
  
  // Supprimer la clé
  const result = await db.collection(COLLECTION_NAME).deleteOne({
    _id: ObjectId.createFromHexString(keyId),
    userId: userId
  });
  
  return result.deletedCount > 0;
}

/**
 * Supprimer toutes les clés API d'un utilisateur
 */
export async function deleteAllApiKeysForUser(userId: string): Promise<number> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).deleteMany({ userId });
  return result.deletedCount;
}