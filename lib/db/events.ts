import { getDb } from "@/lib/mongodb";
import { Event } from "@/lib/types/Event";

const COLLECTION_NAME = "events";

// Type pour un événement dans MongoDB
export type EventDocument = Event;

// Get all events for a specific lair
export async function getEventsByLairId(lairId: string): Promise<Event[]> {
  const db = await getDb();
  
  const events = await db
    .collection<EventDocument>(COLLECTION_NAME)
    .find({ 
      lairId,
    })
    .toArray();
  
  return events.map(event => ({
    ...event,
    id: event._id.toString(),
    _id: undefined,
  }));
}

// Get all events across all lairs
export async function getAllEvents(): Promise<Event[]> {
  const db = await getDb();
  const events = await db
    .collection<EventDocument>(COLLECTION_NAME)
    .find({})
    .toArray();

  return events.map(event => ({
    ...event,
    id: event._id.toString(),
    _id: undefined,
  }))
}

// Get events for multiple lairs
export async function getEventsByLairIds(lairIds: string[]): Promise<Event[]> {
  const db = await getDb();
  
  const events = await db
    .collection<EventDocument>(COLLECTION_NAME)
    .find({ 
      lairId: { $in: lairIds }
    })
    .toArray();

  return events.map(event => ({
    ...event,
    id: event._id.toString(),
    _id: undefined,
  }))
}

// Create a single event
export async function createEvent(event: Event): Promise<Event> {
  const db = await getDb();
  await db.collection<EventDocument>(COLLECTION_NAME).insertOne(event);
  return event;
}

// Create multiple events
export async function createManyEvents(events: Event[]): Promise<void> {
  if (events.length === 0) return;
  
  const db = await getDb();
  await db.collection<EventDocument>(COLLECTION_NAME).insertMany(events);
}

// Update an event
export async function updateEvent(id: string, event: Partial<Event>): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    { id },
    { $set: event }
  );
  
  return result.modifiedCount > 0;
}

// Delete an event
export async function deleteEvent(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection<EventDocument>(COLLECTION_NAME).deleteOne({ id });
  return result.deletedCount > 0;
}

// Delete all events for a specific lair
export async function deleteEventsByLairId(lairId: string): Promise<number> {
  const db = await getDb();
  const result = await db.collection<EventDocument>(COLLECTION_NAME).deleteMany({ lairId });
  return result.deletedCount;
}

// Replace all AI-scrapped events for a lair (delete old AI-scrapped ones and insert new ones)
// User-created events are preserved
export async function replaceEventsForLair(lairId: string, events: Event[]): Promise<void> {
  const db = await getDb();
  
  // Use a transaction for atomic operation
  const session = db.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      // Delete only AI-scrapped events for this lair
      await db.collection<EventDocument>(COLLECTION_NAME).deleteMany({ 
        lairId,
        addedBy: "AI-SCRAPPING"
      }, { session });
      
      // Insert new events if any
      if (events.length > 0) {
        await db.collection<EventDocument>(COLLECTION_NAME).insertMany(events, { session });
      }
    });
  } finally {
    await session.endSession();
  }
}