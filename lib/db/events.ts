import { getDb } from "@/lib/mongodb";
import { Event } from "@/lib/types/Event";
import { getUserById } from "@/lib/db/users";

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

/**
 * Get events for a specific user based on their followed lairs and games
 * Uses MongoDB aggregation for optimal performance
 * @param userId - The user's ID
 * @param allGames - If true, return events for all games. If false, only return events for games followed by the user
 * @param month - Optional month to filter (1-12)
 * @param year - Optional year to filter
 * @returns Array of events matching the user's preferences
 */
export async function getEventsForUser(
  userId: string, 
  allGames: boolean,
  month?: number,
  year?: number
): Promise<Event[]> {
  // Get user data
  const user = await getUserById(userId);
  
  if (!user) {
    return [];
  }
  
  // If user doesn't follow any lairs, return empty array
  if (!user.lairs || user.lairs.length === 0) {
    return [];
  }
  
  const db = await getDb();
  
  // Build aggregation pipeline
  const pipeline: Array<Record<string, unknown>> = [
    // Match events from user's followed lairs
    {
      $match: {
        lairId: { $in: user.lairs }
      }
    }
  ];

  // Add date range filter if month and year are provided
  if (month && year) {
    // Create date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    
    pipeline.push({
      $match: {
        startDateTime: {
          $gte: startDate.toISOString(),
          $lte: endDate.toISOString()
        }
      }
    });
  }
  
  // If not showing all games, filter by user's followed games
  if (!allGames) {
    // If user doesn't follow any games, return empty array
    if (!user.games || user.games.length === 0) {
      return [];
    }
    
    // Convert user.games string IDs to ObjectIds for comparison
    const { ObjectId } = await import("mongodb");
    const gameObjectIds = user.games.map(id => {
      try {
        return new ObjectId(id);
      } catch (e) {
        console.error(`Invalid game ID: ${id}`);
        return null;
      }
    }).filter((id): id is import("mongodb").ObjectId => id !== null);
    
    // Add lookup stage to join with games collection
    pipeline.push(
      // Lookup games to get game names from game IDs
      {
        $lookup: {
          from: "games",
          let: { eventGameName: "$gameName" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$name", "$$eventGameName"] },
                    { $in: ["$_id", gameObjectIds] }
                  ]
                }
              }
            }
          ],
          as: "matchedGame"
        }
      },
      // Only keep events that have a matching game
      {
        $match: {
          matchedGame: { $ne: [] }
        }
      },
      // Remove the matchedGame field from results
      {
        $project: {
          matchedGame: 0
        }
      }
    );
  }
  
  // Add lookup to get lair details
  pipeline.push({
    $lookup: {
      from: "lairs",
      let: { lairId: { $toObjectId: "$lairId" } },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$_id", "$$lairId"] }
          }
        }
      ],
      as: "lairDetails"
    }
  });
  
  // Execute aggregation
  const events = await db
    .collection<EventDocument>(COLLECTION_NAME)
    .aggregate(pipeline)
    .toArray();

  console.log(events[0]); 
  // Map results to Event type
  return events.map((event) => ({
    id: event._id.toString(),
    lairId: event.lairId,
    name: event.name,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    gameName: event.gameName,
    url: event.url,
    price: event.price,
    status: event.status,
    addedBy: event.addedBy,
    lair: event.lairDetails && event.lairDetails.length > 0 ? {
      id: event.lairDetails[0].id,
      name: event.lairDetails[0].name,
    } : undefined,
  }));
}