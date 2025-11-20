import db from "@/lib/mongodb";
import { Event } from "@/lib/types/Event";
import { getUserById } from "@/lib/db/users";
import { getLairIdsNearLocation } from "./lairs";
import { ObjectId } from "mongodb";

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
  if (allGames !== undefined && !allGames && user) {
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
    id: event.id,
    lairId: event.lairId,
    name: event.name,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    gameName: event.gameName,
    url: event.url,
    price: event.price,
    status: event.status,
    addedBy: event.addedBy,
    creatorId: event.creatorId,
    participants: event.participants,
    maxParticipants: event.maxParticipants,
    lair: event.lairDetails && event.lairDetails.length > 0 ? {
      id: event.lairDetails[0].id,
      name: event.lairDetails[0].name,
    } : undefined,
  }));
}

// Get all events across all lairs
export async function getAllEvents({ year, month, games, userId }: { year?: number; month?: number; games?: string[]; userId?: string } = {}): Promise<Event[]> {
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
  
  // Filtrer les lairs privés
  pipeline.push({
    $match: {
      "lairDetails.isPrivate": { $ne: true }
    }
  });

  // Execute aggregation
  const events = await db
    .collection<EventDocument>(COLLECTION_NAME)
    .aggregate(pipeline)
    .toArray();

  // Map results to Event type
  return events.map((event) => ({
    id: event.id,
    lairId: event.lairId,
    name: event.name,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    gameName: event.gameName,
    url: event.url,
    price: event.price,
    status: event.status,
    addedBy: event.addedBy,
    creatorId: event.creatorId,
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
  year, month, userId
}: {
  year?: number;
  month?: number;
  userId?: string;
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
    id: event.id,
    lairId: event.lairId,
    name: event.name,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    gameName: event.gameName,
    url: event.url,
    price: event.price,
    status: event.status,
    addedBy: event.addedBy,
    creatorId: event.creatorId,
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
 * Upsert AI-scrapped events for a lair
 * - Updates existing events if they have the same URL + lairId
 * - Inserts new events if they don't exist yet
 * - Preserves user-created events
 * @param lairId - The lair's ID
 * @param events - The events to upsert
 * @returns Object with counts of inserted and updated events
 */
export async function upsertEventsForLair(lairId: string, events: Event[]): Promise<{ inserted: number; updated: number }> {
  if (events.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  // Use a transaction for atomic operation
  const session = db.client.startSession();
  let inserted = 0;
  let updated = 0;

  try {
    await session.withTransaction(async () => {
      for (const event of events) {
        // Si l'événement a une URL, on utilise URL + lairId comme discriminant
        if (event.url) {
          const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
            {
              lairId,
              url: event.url,
              addedBy: "AI-SCRAPPING"
            },
            {
              $set: {
                name: event.name,
                startDateTime: event.startDateTime,
                endDateTime: event.endDateTime,
                gameName: event.gameName,
                price: event.price,
                status: event.status,
              }
            },
            { session }
          );

          if (result.matchedCount > 0) {
            updated++;
          } else {
            // L'événement n'existe pas, on l'insère
            await db.collection<EventDocument>(COLLECTION_NAME).insertOne(event, { session });
            inserted++;
          }
        } else {
          // Si pas d'URL, on insère toujours (impossible de détecter les doublons)
          await db.collection<EventDocument>(COLLECTION_NAME).insertOne(event, { session });
          inserted++;
        }
      }
    });
  } finally {
    await session.endSession();
  }

  return { inserted, updated };
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

  let lairs = user.lairs ?? [];
  // Si userLocation et maxDistanceKm sont fournis, utiliser la recherche géospatiale
  if (userLocation && maxDistanceKm !== undefined && maxDistanceKm > 0) {
    // Obtenir les IDs des lairs à proximité
    lairs = await getLairIdsNearLocation(
      userLocation.longitude,
      userLocation.latitude,
      maxDistanceKm * 1000 // Convertir km en mètres
    );
  }

  // Build aggregation pipeline
  const pipeline: Array<Record<string, unknown>> = [
    // Match events from user's followed lairs OR private events where user is creator/participant OR favorited events
    {
      $match: {
        $or: [
          // Events from followed lairs (if user follows any)
          ...(lairs && lairs.length > 0 ? [{ lairId: { $in: lairs } }] : []),
          // Private events where user is the creator
          { lairId: null, creatorId: userId },
          // Private events where user is a participant
          { lairId: null, participants: userId },
          // Events favorited by the user
          { favoritedBy: userId }
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
    // Convert user.games string IDs to ObjectIds for comparison
    const gameObjectIds = user.games.map(id => {
      try {
        return new ObjectId(id);
      } catch (e) {
        console.error(`Invalid game ID: ${id}`);
        return null;
      }
    }).filter((id) => id !== null);

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
          $or: [
            // Events from followed lairs with matching games
            { matchedGame: { $ne: [] } },
            // Private events where user is the creator
            { lairId: null, creatorId: userId },
            // Private events where user is a participant
            { lairId: null, participants: userId },
            // Favorited events (always shown regardless of game filter)
            { favoritedBy: userId }
          ]
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
  // Add lookup for addeBy user details
  pipeline.push({
    $lookup: {
      from: "user",
      let: { creatorId: "$creatorId" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$_id", { $toObjectId: "$$creatorId" }] }
              ]
            }
          }
        },
        {
          $project: {
            id: 1,
            discriminator: 1,
            displayName: 1,
          }
        }
      ],
      as: "creator",
    },
  });

  // Execute aggregation
  const events = await db
    .collection<EventDocument>(COLLECTION_NAME)
    .aggregate(pipeline)
    .toArray();

  // Map results to Event type
  const mappedEvents = events.map((event) => ({
    id: event.id,
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
    creatorId: event.creatorId,
    creator: event.creator && event.creator.length > 0 ? event.creator[0] : undefined,
    favoritedBy: event.favoritedBy,
    lair: event.lairDetails && event.lairDetails.length > 0 ? {
      id: event.lairDetails[0]._id.toString(),
      name: event.lairDetails[0].name,
      location: event.lairDetails[0].location,
      address: event.lairDetails[0].address,
      owners: event.lairDetails[0].owners,
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
    },
    {
      $lookup: {
        from: "user",
        let: { creatorId: "$creatorId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", { $toObjectId: "$$creatorId" }] }
                ]
              }
            }
          },
          {
            $project: {
              id: 1,
              discriminator: 1,
              displayName: 1,
            }
          }
        ],
        as: "creator",
      },
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
    id: event.id,
    lairId: event.lairId,
    name: event.name,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    gameName: event.gameName,
    url: event.url,
    price: event.price,
    status: event.status,
    addedBy: event.addedBy,
    creatorId: event.creatorId,
    creator: event.creator && event.creator.length > 0 ? event.creator[0] : undefined,
    participants: event.participants,
    maxParticipants: event.maxParticipants,
    favoritedBy: event.favoritedBy,
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

/**
 * Add an event to a user's favorites
 * @param eventId - The event's UUID
 * @param userId - The user's ID
 * @returns True if the event was favorited, false otherwise
 */
export async function addEventToFavorites(eventId: string, userId: string): Promise<boolean> {
  const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    { id: eventId },
    {
      $addToSet: { favoritedBy: userId }
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Remove an event from a user's favorites
 * @param eventId - The event's UUID
 * @param userId - The user's ID
 * @returns True if the event was unfavorited, false otherwise
 */
export async function removeEventFromFavorites(eventId: string, userId: string): Promise<boolean> {
  const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    { id: eventId },
    {
      $pull: { favoritedBy: userId }
    }
  );

  return result.modifiedCount > 0;
}