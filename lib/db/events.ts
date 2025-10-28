import { getDb } from "@/lib/mongodb";
import { Event } from "@/lib/types/Event";
import { ObjectId, WithId, Document } from "mongodb";
import { LairDocument } from "./lairs";
import { Lair } from "../types/Lair";

const COLLECTION_NAME = "events";

// Type pour un événement dans MongoDB (avec _id)
export type EventDocument = Omit<Event, "id"> & { _id: ObjectId };

// Convertir un document MongoDB en Event
function toEvent(doc: WithId<Document>): Event {
  return {
    id: doc._id.toString(),
    lairId: doc.lairId,
    name: doc.name,
    startDateTime: doc.startDateTime,
    endDateTime: doc.endDateTime,
    gameName: doc.gameName,
    price: doc.price,
    status: doc.status,
  };
}

// Convertir un Event en document MongoDB (sans id)
function toDocument(event: Omit<Event, "id">): Omit<EventDocument, "_id"> {
  return {
    lairId: event.lairId,
    name: event.name,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    gameName: event.gameName,
    price: event.price,
    status: event.status,
  };
}

export async function getEventsByLairId(lairId: string): Promise<Event[]> {
  const db = await getDb();
  
  const lair = await db
    .collection<LairDocument>('lairs')
    .findOne({ 
      _id: new ObjectId(lairId),
    });

    if (!lair || !lair.events) {
        return [];
    }
  
  return lair.events;
}

export async function getAllEvents(): Promise<Event[]> {
  const db = await getDb();
  const result = await db
    .collection<Lair>('lairs')
    .aggregate<Event>([
      { $unwind: '$events' },
      { $replaceRoot: { newRoot: '$events' } }
    ])
    .toArray();

  return result;
}

export async function getEventsByLairIds(lairIds: string[]): Promise<Event[]> {
  const db = await getDb();
  
  // Convertir les IDs de string à ObjectId
  const objectIds = lairIds.map(id => new ObjectId(id));
  
  const result = await db
    .collection<Lair>('lairs')
    .aggregate<Event>([
      { $match: { _id: { $in: objectIds } } },
      { $unwind: '$events' },
      { $replaceRoot: { newRoot: '$events' } }
    ])
    .toArray();

  return result;
}