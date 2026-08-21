import db from "@/lib/mongodb";
import { purgeStreamTarget } from "@/lib/db/stream-links";
import { Lair, LairProGrant } from "@/lib/types/Lair";
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
    // `proGrant` n'est volontairement pas repris : voir `LairProGrant`. Il sort
    // par `getLairProGrant`, et seulement là.
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
    const allLairs = await db.collection(COLLECTION_NAME).find(geoQuery).project<LairDocument>({
      eventsSourceUrls: 0,
      eventsSourceInstructions: 0,
    }).toArray();
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
    db.collection(COLLECTION_NAME).find(query).skip(skip).limit(limit).project<LairDocument>({
      eventsSourceUrls: 0,
      eventsSourceInstructions: 0,
    }).toArray(),
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

export async function getLairsByIds(ids: string[]): Promise<Lair[]> {
  const objectIds = ids.map(id => new ObjectId(id));
  const lairs = await db.collection(COLLECTION_NAME).find({
    _id: { $in: objectIds }
  }).toArray();
  return lairs.map(toLair);
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

/**
 * Offre l'accès Pro à un lieu, ou en réécrit le motif.
 *
 * Écriture ciblée sur `proGrant` seul : passer par `updateLair` aurait exigé de
 * relire puis renvoyer le lieu, avec la fenêtre de concurrence qui va avec.
 *
 * Un octroi déjà en place est **remplacé**, non refusé : corriger un motif mal
 * saisi doit rester possible sans avoir à retirer puis rendre l'accès, ce qui
 * ferait clignoter les droits du lieu entre les deux.
 */
export async function grantProToLair({
  lairId,
  grantedBy,
  reason,
}: {
  lairId: string;
  grantedBy: string;
  reason: string;
}): Promise<LairProGrant | null> {
  // Sur un octroi déjà en place, seul le motif change : réécrire `grantedAt` et
  // `grantedBy` ferait qu'une faute de frappe corrigée six mois plus tard
  // effacerait la date et l'auteur réels — c'est-à-dire précisément la trace
  // pour laquelle ces deux champs existent.
  const existing = await getLairProGrant(lairId);
  const grant: LairProGrant = existing
    ? { ...existing, reason }
    : { grantedAt: new Date(), grantedBy, reason };

  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(lairId) },
    { $set: { proGrant: grant } },
    { returnDocument: "after" }
  );

  return result ? grant : null;
}

/**
 * L'octroi d'un lieu, en entier — motif et auteur compris.
 *
 * **Réservé à l'écran d'administration.** Partout ailleurs, `lairHasProGrant`
 * suffit et ne divulgue rien.
 */
export async function getLairProGrant(lairId: string): Promise<LairProGrant | null> {
  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: new ObjectId(lairId) }, { projection: { proGrant: 1 } });

  return (doc?.proGrant as LairProGrant | undefined) ?? null;
}

/**
 * Ce lieu tient-il un octroi ? Un booléen, sans le motif ni son auteur.
 *
 * C'est ce que `lairHasPro` appelle : la vérification a lieu à chaque rendu de
 * page de lieu, et n'a aucun besoin de la partie confidentielle.
 */
export async function lairHasProGrant(lairId: string): Promise<boolean> {
  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: new ObjectId(lairId), proGrant: { $ne: null } }, { projection: { _id: 1 } });

  return doc !== null;
}

/** Retire l'accès offert. Le lieu peut rester Pro par son parrainage. */
export async function revokeProFromLair(
  lairId: string
): Promise<"revoked" | "not-granted" | "not-found"> {
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(lairId), proGrant: { $ne: null } },
    { $unset: { proGrant: "" } }
  );

  if (result.modifiedCount > 0) {
    return "revoked";
  }

  // `modifiedCount` à zéro confond deux causes très différentes : le lieu
  // n'existe pas, ou il n'avait pas d'octroi. Les distinguer coûte une lecture
  // et évite d'annoncer « ce lieu n'a pas d'accès offert » à propos d'un lieu
  // supprimé entre-temps.
  const exists = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: new ObjectId(lairId) }, { projection: { _id: 1 } });

  return exists ? "not-granted" : "not-found";
}

/**
 * Parmi les lieux demandés, ceux qui tiennent un accès Pro offert.
 *
 * En une requête : `proLairIds` s'en sert pour l'index des lieux, où une
 * lecture par lieu ferait un N+1.
 */
export async function getLairIdsWithProGrant(lairIds: string[]): Promise<Set<string>> {
  if (lairIds.length === 0) {
    return new Set();
  }

  const docs = await db
    .collection(COLLECTION_NAME)
    .find(
      { _id: { $in: lairIds.map((id) => new ObjectId(id)) }, proGrant: { $ne: null } },
      { projection: { _id: 1 } }
    )
    .toArray();

  return new Set(docs.map((doc) => doc._id.toString()));
}

export async function deleteLair(id: string): Promise<boolean> {

  const result = await db.collection(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    return false;
  }

  // Le lieu disparaît, les directs qui devaient s'y annoncer aussi : une
  // destination fantôme ferait échouer une annonce sur deux sans que son
  // propriétaire comprenne pourquoi (voir `docs/STREAM_LINKING.md`).
  await purgeStreamTarget({ kind: "lair", id });

  return true;
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
