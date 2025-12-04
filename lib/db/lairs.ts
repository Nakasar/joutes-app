import db from "@/lib/mongodb";
import { Lair } from "@/lib/types/Lair";
import { ObjectId, WithId, Document, Filter } from "mongodb";

const COLLECTION_NAME = "lairs";

// Type pour les options de recherche des lairs
export type SearchLairsOptions = {
  userId?: string;
  search?: string;
  gameIds?: string[];
  nearLocation?: {
    longitude: number;
    latitude: number;
    maxDistanceMeters?: number;
  };
  page?: number;
  limit?: number;
};

// Type pour le résultat de recherche paginé
export type PaginatedLairsResult = {
  lairs: Lair[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// Type pour un lieu dans MongoDB (avec _id)
export type LairDocument = Omit<Lair, "id"> & { _id: ObjectId };

// Convertir un document MongoDB en Lair
function toLair(doc: WithId<Document>): Lair {
  return {
    id: doc._id.toString(),
    name: doc.name,
    banner: doc.banner,
    games: doc.games || [],
    owners: doc.owners || [],
    eventsSourceUrls: doc.eventsSourceUrls || [],
    eventsSourceInstructions: doc.eventsSourceInstructions,
    location: doc.location,
    address: doc.address,
    website: doc.website,
    isPrivate: doc.isPrivate || false,
    invitationCode: doc.invitationCode,
    options: doc.options,
  };
}

// Convertir un Lair en document MongoDB (sans id)
function toDocument(lair: Omit<Lair, "id">): Omit<LairDocument, "_id"> {
  return {
    name: lair.name,
    banner: lair.banner,
    games: lair.games,
    owners: lair.owners,
    eventsSourceUrls: lair.eventsSourceUrls || [],
    eventsSourceInstructions: lair.eventsSourceInstructions,
    location: lair.location,
    address: lair.address,
    website: lair.website,
    isPrivate: lair.isPrivate || false,
    invitationCode: lair.invitationCode,
    options: lair.options,
  };
}

export async function getAllLairs(userId?: string): Promise<Lair[]> {
  
  let query: Record<string, unknown> = {};
  
  if (userId) {
    // Si un utilisateur est connecté, afficher les lairs publics + les lairs privés qu'il suit
    query = {
      $or: [
        { isPrivate: { $ne: true } },
        { isPrivate: true, owners: userId },
      ]
    };
  } else {
    // Si pas d'utilisateur, afficher uniquement les lairs publics
    query = { isPrivate: { $ne: true } };
  }
  
  const lairs = await db.collection(COLLECTION_NAME).find(query).toArray();
  return lairs.map(toLair);
}

export async function searchLairs(options: SearchLairsOptions): Promise<PaginatedLairsResult> {
  const {
    userId,
    search,
    gameIds,
    nearLocation,
    page = 1,
    limit = 10,
  } = options;

  // Build the base visibility query
  let visibilityQuery: Filter<Document>;
  if (userId) {
    visibilityQuery = {
      $or: [
        { isPrivate: { $ne: true } },
        { isPrivate: true, owners: userId },
      ]
    };
  } else {
    visibilityQuery = { isPrivate: { $ne: true } };
  }

  // Build additional filters
  const filters: Filter<Document>[] = [visibilityQuery];

  // Search by name
  if (search && search.trim()) {
    filters.push({
      name: { $regex: search.trim(), $options: "i" }
    });
  }

  // Filter by games
  if (gameIds && gameIds.length > 0) {
    filters.push({
      games: { $in: gameIds }
    });
  }

  // Combine all filters
  const query: Filter<Document> = filters.length > 1 ? { $and: filters } : filters[0];

  // If nearLocation is specified, use geo query
  if (nearLocation) {
    await ensureGeospatialIndex();
    
    const geoQuery: Filter<Document> = {
      $and: [
        query,
        {
          location: {
            $near: {
              $geometry: {
                type: "Point",
                coordinates: [nearLocation.longitude, nearLocation.latitude]
              },
              $maxDistance: nearLocation.maxDistanceMeters || 50000
            }
          }
        }
      ]
    };

    // For geo queries, we can't use skip/limit directly with $near in the same way
    // So we need to handle it differently
    const allLairs = await db.collection(COLLECTION_NAME).find(geoQuery).toArray();
    const total = allLairs.length;
    const skip = (page - 1) * limit;
    const paginatedLairs = allLairs.slice(skip, skip + limit);

    return {
      lairs: paginatedLairs.map(toLair),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Standard query with pagination
  const skip = (page - 1) * limit;
  
  const [lairs, total] = await Promise.all([
    db.collection(COLLECTION_NAME).find(query).skip(skip).limit(limit).toArray(),
    db.collection(COLLECTION_NAME).countDocuments(query),
  ]);

  return {
    lairs: lairs.map(toLair),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getLairById(id: string): Promise<Lair | null> {
  
  const lair = await db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
  return lair ? toLair(lair) : null;
}

export async function createLair(lair: Omit<Lair, "id">): Promise<Lair> {
  
  const doc = toDocument(lair);
  const result = await db.collection(COLLECTION_NAME).insertOne(doc);
  
  return {
    id: result.insertedId.toString(),
    ...lair,
  };
}

export async function updateLair(id: string, lair: Partial<Omit<Lair, "id">>): Promise<Lair | null> {
  
  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: lair },
    { returnDocument: 'after' }
  );
  
  return result ? toLair(result) : null;
}

export async function deleteLair(id: string): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

export async function addOwnerToLair(lairId: string, userId: string): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(lairId) },
    { $addToSet: { owners: userId } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function removeOwnerFromLair(lairId: string, userId: string): Promise<boolean> {
  
  const result = await db.collection<LairDocument>(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(lairId) },
    { $pull: { owners: userId } }
  );
  
  return result.modifiedCount > 0;
}

// Créer l'index géospatial sur le champ location
export async function ensureGeospatialIndex(): Promise<void> {
  
  await db.collection(COLLECTION_NAME).createIndex({ location: "2dsphere" });
}

// Obtenir les IDs des lairs à proximité d'une position
export async function getLairIdsNearLocation(
  longitude: number,
  latitude: number,
  maxDistanceMeters: number = 50000 // Par défaut 50km
): Promise<string[]> {
  
  
  // S'assurer que l'index géospatial existe
  await ensureGeospatialIndex();
  
  const lairs = await db.collection(COLLECTION_NAME).find({
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistanceMeters
      }
    }
  }).toArray();
  
  return lairs.map(lair => lair._id.toString());
}

/**
 * Get all lairs owned by a user
 * @param userId - The user's ID
 * @returns Array of lairs owned by the user
 */
export async function getLairsOwnedByUser(userId: string): Promise<Lair[]> {
  
  const lairs = await db.collection(COLLECTION_NAME).find({ owners: userId }).toArray();
  return lairs.map(toLair);
}

/**
 * Get a lair by its invitation code
 * @param invitationCode - The invitation code
 * @returns The lair or null if not found
 */
export async function getLairByInvitationCode(invitationCode: string): Promise<Lair | null> {
  
  const lair = await db.collection(COLLECTION_NAME).findOne({ 
    invitationCode,
    isPrivate: true 
  });
  return lair ? toLair(lair) : null;
}

/**
 * Regenerate the invitation code for a private lair
 * @param lairId - The lair's ID
 * @param newCode - The new invitation code
 * @returns The updated lair or null if not found
 */
export async function regenerateInvitationCode(lairId: string, newCode: string): Promise<Lair | null> {
  
  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(lairId), isPrivate: true },
    { $set: { invitationCode: newCode } },
    { returnDocument: 'after' }
  );
  
  return result ? toLair(result) : null;
}
