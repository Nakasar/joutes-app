import db from "@/lib/mongodb";
import { Lair } from "@/lib/types/Lair";
import { ObjectId, WithId, Document } from "mongodb";

const COLLECTION_NAME = "lairs";

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
  };
}

export async function getAllLairs(): Promise<Lair[]> {
  
  const lairs = await db.collection(COLLECTION_NAME).find({}).toArray();
  return lairs.map(toLair);
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
