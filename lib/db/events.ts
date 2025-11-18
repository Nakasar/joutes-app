import db from "@/lib/mongodb";
import { Event } from "@/lib/types/Event";
import { getUserById } from "@/lib/db/users";
import { getLairIdsNearLocation } from "./lairs";

const COLLECTION_NAME = "events";

// Type pour un événement dans MongoDB
export type EventDocument = Event;

/**
 * Get all events for a specific lair (optionally filtered by month/year and user's followed games)
 * @param lairId - The lair's ID
 * @param year - Optional year to filter (e.g., 2024)
 * @param month - Optional month to filter (1-12)
 * @param allGames - If true, return events for all games. If false, only return events for games followed by the user
 * @param userId - Optional user ID to filter by their followed games
 * @returns Array of events for the lair
 */
export async function getEventsByLairId(lairId: string, { year, month, allGames, userId }: { userId?: string; year?: number; month?: number; allGames?: boolean } = {}): Promise<Event[]> {
  
  
  const user = userId && await getUserById(userId);

  // Build aggregation pipeline
  const pipeline: Array<Record<string, unknown>> = [
    // Match events from user's followed lairs
    {
      $match: {
        lairId,
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
  if (!allGames && user) {
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
    participants: event.participants,
    maxParticipants: event.maxParticipants,
    lair: event.lairDetails && event.lairDetails.length > 0 ? {
      id: event.lairDetails[0].id,
      name: event.lairDetails[0].name,
    } : undefined,
  }));  
}

// Get all events across all lairs
export async function getAllEvents({ year, month, games }: { year?: number; month?: number; games?: string[] } = {}): Promise<Event[]> {
  

  // Build aggregation pipeline
  const pipeline: Array<Record<string, unknown>> = [];

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
    participants: event.participants,
    maxParticipants: event.maxParticipants,
    lair: event.lairDetails && event.lairDetails.length > 0 ? {
      id: event.lairDetails[0].id,
      name: event.lairDetails[0].name,
    } : undefined,
  }));
}

// Get events for multiple lairs
export async function getEventsByLairIds(lairIds: string[], {
  year, month
}: {
  year?: number;
  month?: number;
} = {}): Promise<Event[]> {
  

  // Build aggregation pipeline
  const pipeline: Array<Record<string, unknown>> = [
    // Match events from user's followed lairs
    {
      $match: {
        lairId: { $in: lairIds },
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
    participants: event.participants,
    maxParticipants: event.maxParticipants,
    lair: event.lairDetails && event.lairDetails.length > 0 ? {
      id: event.lairDetails[0].id,
      name: event.lairDetails[0].name,
    } : undefined,
  }));  
}

// Create a single event
export async function createEvent(event: Event): Promise<Event> {
  
  await db.collection<EventDocument>(COLLECTION_NAME).insertOne(event);
  return event;
}

// Create multiple events
export async function createManyEvents(events: Event[]): Promise<void> {
  if (events.length === 0) return;

  
  await db.collection<EventDocument>(COLLECTION_NAME).insertMany(events);
}

// Update an event
export async function updateEvent(id: string, event: Partial<Event>): Promise<boolean> {
  
  const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    { id },
    { $set: event }
  );

  return result.modifiedCount > 0;
}

// Delete an event
export async function deleteEvent(id: string): Promise<boolean> {
  
  const result = await db.collection<EventDocument>(COLLECTION_NAME).deleteOne({ id });
  return result.deletedCount > 0;
}

// Delete all events for a specific lair
export async function deleteEventsByLairId(lairId: string): Promise<number> {
  
  const result = await db.collection<EventDocument>(COLLECTION_NAME).deleteMany({ lairId });
  return result.deletedCount;
}

// Replace all AI-scrapped events for a lair (delete old AI-scrapped ones and insert new ones)
// User-created events are preserved
export async function replaceEventsForLair(lairId: string, events: Event[]): Promise<void> {
  

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
 * Includes private events where the user is the creator or a participant
 * @param userId - The user's ID
 * @param allGames - If true, return events for all games. If false, only return events for games followed by the user
 * @param month - Optional month to filter (1-12)
 * @param year - Optional year to filter
 * @param userLocation - Optional user GPS location for distance filtering
 * @param maxDistanceKm - Optional maximum distance in kilometers
 * @returns Array of events matching the user's preferences
 */
export async function getEventsForUser(
  userId: string,
  allGames: boolean,
  month?: number,
  year?: number,
  userLocation?: { latitude: number; longitude: number },
  maxDistanceKm?: number
): Promise<Event[]> {
  // Get user data
  const user = await getUserById(userId);

  if (!user) {
    return [];
  }

  
  
  // Si userLocation et maxDistanceKm sont fournis, utiliser la recherche géospatiale
  if (userLocation && maxDistanceKm !== undefined && maxDistanceKm > 0 && user.lairs && user.lairs.length > 0) {
    // Obtenir les IDs des lairs à proximité
    const nearbyLairIds = await getLairIdsNearLocation(
      userLocation.longitude,
      userLocation.latitude,
      maxDistanceKm * 1000 // Convertir km en mètres
    );
    
    // Filtrer pour ne garder que les lairs suivis par l'utilisateur ET à proximité
    const filteredLairIds = user.lairs.filter(lairId => nearbyLairIds.includes(lairId));
    
    // Utiliser les lairs filtrés s'il y en a
    if (filteredLairIds.length > 0) {
      user.lairs = filteredLairIds;
    }
  }

  // Build aggregation pipeline
  const pipeline: Array<Record<string, unknown>> = [
    // Match events from user's followed lairs OR private events where user is creator/participant
    {
      $match: {
        $or: [
          // Events from followed lairs (if user follows any)
          ...(user.lairs && user.lairs.length > 0 ? [{ lairId: { $in: user.lairs } }] : []),
          // Private events where user is the creator
          { lairId: { $exists: false }, addedBy: userId },
          // Private events where user is a participant
          { lairId: { $exists: false }, participants: userId }
        ]
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

  // Map results to Event type
  const mappedEvents = events.map((event) => ({
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
    participants: event.participants,
    maxParticipants: event.maxParticipants,
    lair: event.lairDetails && event.lairDetails.length > 0 ? {
      id: event.lairDetails[0]._id.toString(),
      name: event.lairDetails[0].name,
      location: event.lairDetails[0].location,
      address: event.lairDetails[0].address,
    } : undefined,
  }));

  return mappedEvents;
}

/**
 * Get a single event by its ID
 * @param eventId - The event's UUID
 * @returns The event or null if not found
 */
export async function getEventById(eventId: string): Promise<Event | null> {
  
  
  const pipeline: Array<Record<string, unknown>> = [
    {
      $match: { id: eventId }
    },
    {
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
    }
  ];

  const events = await db
    .collection<EventDocument>(COLLECTION_NAME)
    .aggregate(pipeline)
    .toArray();

  if (events.length === 0) {
    return null;
  }

  const event = events[0];
  return {
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
    participants: event.participants,
    maxParticipants: event.maxParticipants,
    lair: event.lairDetails && event.lairDetails.length > 0 ? {
      id: event.lairDetails[0]._id.toString(),
      name: event.lairDetails[0].name,
      location: event.lairDetails[0].location,
      address: event.lairDetails[0].address,
    } : undefined,
  };
}

/**
 * Add a participant to an event
 * @param eventId - The event's UUID
 * @param userId - The user's ID
 * @returns True if the participant was added, false otherwise
 */
export async function addParticipantToEvent(eventId: string, userId: string): Promise<boolean> {
  const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    { id: eventId },
    { 
      $addToSet: { participants: userId }
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Remove a participant from an event
 * @param eventId - The event's UUID
 * @param userId - The user's ID
 * @returns True if the participant was removed, false otherwise
 */
export async function removeParticipantFromEvent(eventId: string, userId: string): Promise<boolean> {
  
  
  const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    { id: eventId },
    { 
      $pull: { participants: userId }
    }
  );

  return result.modifiedCount > 0;
}