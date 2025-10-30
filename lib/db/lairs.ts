import { getDb } from "@/lib/mongodb";
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
  };
}

export async function getAllLairs(): Promise<Lair[]> {
  const db = await getDb();
  const lairs = await db.collection(COLLECTION_NAME).find({}).toArray();
  return lairs.map(toLair);
}

export async function getLairById(id: string): Promise<Lair | null> {
  const db = await getDb();
  const lair = await db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
  return lair ? toLair(lair) : null;
}

export async function createLair(lair: Omit<Lair, "id">): Promise<Lair> {
  const db = await getDb();
  const doc = toDocument(lair);
  const result = await db.collection(COLLECTION_NAME).insertOne(doc);
  
  return {
    id: result.insertedId.toString(),
    ...lair,
  };
}

export async function updateLair(id: string, lair: Partial<Omit<Lair, "id">>): Promise<Lair | null> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: lair },
    { returnDocument: 'after' }
  );
  
  return result ? toLair(result) : null;
}

export async function deleteLair(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

export async function addOwnerToLair(lairId: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(lairId) },
    { $addToSet: { owners: userId } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function removeOwnerFromLair(lairId: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(lairId) },
    { $pull: { owners: userId } } as any
  );
  
  return result.modifiedCount > 0;
}
