import db from "@/lib/mongodb";
import {Event, RegistrationStatus} from "@/lib/types/Event";
import {getUserById} from "@/lib/db/users";
import {getLairIdsNearLocation} from "./lairs";
import {AnyBulkWriteOperation, ObjectId, UpdateFilter} from "mongodb";
import {DateTime} from "luxon";
import {
  AUTOMATED_EVENT_AUTHORS,
  reconcileSourceEvents,
  type SourceEvent,
  type SourceEventPatch,
} from "@/lib/events/source-events";

const COLLECTION_NAME = "events";

// Type pour un événement dans MongoDB
export type EventDocument = Event;

/**
 * Get all events for a specific lair (optionally filtered by month/year and game)
 * @param lairId - The lair's ID
 * @param year - Optional year to filter (e.g., 2024)
 * @param month - Optional month to filter (1-12)
 * @param gameId - Optional game filter: "followed" (user's followed games), "all" (all games), or a specific game ID
 * @param userId - Optional user ID to filter by their followed games
 * @returns Array of events for the lair
 */
export async function getEventsByLairId(lairId: string, {year, month, gameId, userId}: {
  userId?: string;
  year?: number;
  month?: number;
  gameId?: string
} = {}): Promise<Event[]> {
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
      },
    });
  }

  pipeline.push(...[
    {
      $lookup: {
        from: "games",
        localField: 'gameName',
        foreignField: 'name',
        pipeline: [
          {
            $project: {
              name: 1,
              icon: 1,
              banner: 1,
              type: 1,
              slug: 1,
            }
          }
        ],
        as: "matchedGame"
      }
    },
    {
      $unwind: "$matchedGame",
    },
  ]);

  // Apply game filter if specified
  if (gameId && gameId !== "all") {
    if (gameId === "followed" && user) {
      // Filter by user's followed games
      if (!user.games || user.games.length === 0) {
        return [];
      }

      // Convert user.games string IDs to ObjectIds for comparison
      const gameObjectIds = user.games.map(id => {
        try {
          return new ObjectId(id);
        } catch (e) {
          console.error(`Invalid game ID: ${id}`);
          return null;
        }
      }).filter((id): id is ObjectId => id !== null);

      // Add lookup stage to join with games collection
      pipeline.push(
        // Lookup games to get game names from game IDs
        {
          $match: {
            'matchedGame._id': {$in: gameObjectIds},
          }
        },
      );
    } else {
      // Filter by specific game ID
      try {
        const gameObjectId = new ObjectId(gameId);

        // Add lookup stage to join with games collection
        pipeline.push(
          // Only keep events that have a matching game
          {
            $match: {
              'matchedGame._id': gameObjectId,
            },
          },
        );
      } catch (e) {
        console.error(`Invalid game ID: ${gameId}`);
        return [];
      }
    }
  }

  // Add lookup to get lair details
  pipeline.push({
    $lookup: {
      from: "lairs",
      let: {lairId: {$toObjectId: "$lairId"}},
      pipeline: [
        {
          $match: {
            $expr: {$eq: ["$_id", "$$lairId"]}
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
    description: event.description,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    gameName: event.gameName,
    // Champ par champ, et non `event.matchedGame` tel quel : la jointure y
    // laisse l'`_id` de Mongo — inutile à `Event.game`, qui ne porte pas
    // d'identifiant, mais qui n'est pas un objet simple et fait échouer la
    // sérialisation dès qu'un composant serveur passe ces événements à un
    // composant client. Le retirer de la projection ne suffirait pas : le
    // filtre par jeu, plus bas, s'appuie sur `matchedGame._id`.
    game: event.matchedGame
      ? {
          name: event.matchedGame.name,
          icon: event.matchedGame.icon,
          banner: event.matchedGame.banner,
          type: event.matchedGame.type,
          slug: event.matchedGame.slug,
        }
      : undefined,
    url: event.url,
    price: event.price,
    status: event.status,
    addedBy: event.addedBy,
    creatorId: event.creatorId,
    participants: event.participants,
    participantRegistrations: event.participantRegistrations,
    // Ne compter que les REGISTERED (cf. joinEventAction) : un participant
    // sans statut explicite est REGISTERED par défaut (addParticipantToEvent),
    // mais PRE_REGISTERED/EXCLUDED ne doivent pas compter dans le remplissage.
    registeredParticipantsCount: (event.participants ?? []).filter(
      (userId: string) => (event.participantRegistrations?.[userId] ?? 'REGISTERED') === 'REGISTERED'
    ).length,
    maxParticipants: event.maxParticipants,
    allowJoin: event.allowJoin,
    favoritedBy: event.favoritedBy,
    lair: event.lairDetails && event.lairDetails.length > 0 ? {
      id: event.lairDetails[0].id,
      name: event.lairDetails[0].name,
    } : undefined,
  }));
}

// Get all events across all lairs
export async function getAllEvents({year, month, games, userId}: {
  year?: number;
  month?: number;
  games?: string[];
  userId?: string
} = {}): Promise<Event[]> {
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
      let: {lairId: {$toObjectId: "$lairId"}},
      pipeline: [
        {
          $match: {
            $expr: {$eq: ["$_id", "$$lairId"]}
          }
        }
      ],
      as: "lairDetails"
    }
  });

  // Filtrer les lairs privés
  pipeline.push({
    $match: {
      "lairDetails.isPrivate": {$ne: true}
    }
  });

  pipeline.push(
    {
      $lookup: {
        from: "games",
        let: {eventGameName: "$gameName"},
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {$eq: ["$name", "$$eventGameName"]},
                ]
              }
            }
          },
          {
            $project: {
              _id: 1,
              name: 1,
              icon: 1,
              banner: 1,
              slug: 1,
              type: 1,
            }
          }
        ],
        as: "game"
      }
    },
    {
      $unwind: {
        path: "$game",
        preserveNullAndEmptyArrays: true,
      },
    },
  );

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
    game: event.game,
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
  year, month, userId, gameIds, afterDate, beforeDate,
}: {
  gameIds?: string[];
  afterDate?: string;
  beforeDate?: string;
  year?: number;
  month?: number;
  userId?: string;
} = {}): Promise<Event[]> {
  // Build aggregation pipeline
  const pipeline: Array<Record<string, unknown>> = [
    // Match events from user's followed lairs
    {
      $match: {
        lairId: {$in: lairIds},
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
  if (afterDate) {
    pipeline.push({
      $match: {
        startDateTime: {
          $gte: afterDate,
        }
      }
    });
  }
  if (beforeDate) {
    pipeline.push({
      $match: {
        startDateTime: {
          $lte: beforeDate,
        }
      }
    });
  }

  pipeline.push({
    $lookup: {
      from: "lairs",
      let: {lairId: {$toObjectId: "$lairId"}},
      pipeline: [
        {
          $match: {
            $expr: {$eq: ["$_id", "$$lairId"]}
          }
        }
      ],
      as: "lairDetails"
    }
  });
  pipeline.push(
    {
      $lookup: {
        from: "games",
        let: {eventGameName: "$gameName"},
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {$eq: ["$name", "$$eventGameName"]},
                ]
              }
            }
          },
          {
            $project: {
              _id: 1,
              name: 1,
              icon: 1,
              banner: 1,
              slug: 1,
              type: 1,
            }
          }
        ],
        as: "game"
      }
    },
    {
      $unwind: {
        path: "$game",
        preserveNullAndEmptyArrays: true,
      },
    },
  );

  if (gameIds) {
    pipeline.push({
      $match: {
        'game._id': {$in: gameIds.map(id => new ObjectId(id))},
      }
    });
  }

  pipeline.push({
    $sort: {
      'startDateTime': 1
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
    game: event.game,
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
    {id},
    {
      $set: {
        ...event,
        boardsNeedsUpdate: true,
      }
    }
  );

  return result.modifiedCount > 0;
}

// Delete an event and all related data (portal settings, matches, announcements, etc.)
export async function deleteEvent(id: string): Promise<boolean> {
  const session = db.client.startSession();

  try {
    let deletedEvent = false;

    await session.withTransaction(async () => {
      // Delete the event itself
      const eventResult = await db.collection<EventDocument>(COLLECTION_NAME).deleteOne({id});
      deletedEvent = eventResult.deletedCount > 0;

      // Delete portal settings
      await db.collection("event-portal-settings").deleteMany({eventId: id});

      // Delete match results
      await db.collection("matches").deleteMany({eventId: id});

      // Delete announcements
      await db.collection("event-announcements").deleteMany({eventId: id});

      // Delete player notes
      await db.collection("event-player-notes").deleteMany({eventId: id});
    });

    await session.endSession();
    return deletedEvent;
  } catch (error) {
    await session.endSession();
    console.error("Error deleting event and related data:", error);
    return false;
  }
}

// Delete all events for a specific lair
export async function deleteEventsByLairId(lairId: string): Promise<number> {

  const result = await db.collection<EventDocument>(COLLECTION_NAME).deleteMany({lairId});
  return result.deletedCount;
}

/**
 * Applique aux événements d'un lieu ce qu'une relecture de ses sources a rendu.
 *
 * Le verdict — quoi insérer, mettre à jour, annuler, retirer — est rendu par
 * `reconcileSourceEvents`, sur la base de **tout** ce que le lieu a
 * d'automatisé ; ici on ne fait que l'exécuter, en une seule écriture groupée
 * et dans une transaction. Les événements saisis à la main ne sont jamais
 * touchés.
 *
 * Un événement retrouvé est mis à jour **en place** : son `id`, ses favoris,
 * ses inscriptions, ses tableaux Discord restent. C'est tout l'objet de la
 * fonction — voir `lib/events/source-events.ts` pour ce que l'ancienne
 * version faisait perdre.
 *
 * `failedSourceUrls` : les sources qui n'ont pas répondu. Leurs événements
 * sont laissés en paix, une panne n'étant pas une annulation.
 */
export async function upsertEventsForLair(
  lairId: string,
  events: SourceEvent[],
  { failedSourceUrls = [], now = DateTime.utc() }: { failedSourceUrls?: string[]; now?: DateTime } = {},
): Promise<{ inserted: number; updated: number; unchanged: number; cancelled: number; removed: number }> {
  const existing = await db
    .collection<EventDocument>(COLLECTION_NAME)
    .find(
      { lairId, addedBy: { $in: [...AUTOMATED_EVENT_AUTHORS] } },
      {
        projection: {
          _id: 0, id: 1, name: 1, startDateTime: 1, endDateTime: 1, gameName: 1, price: 1,
          status: 1, url: 1, addedBy: 1, favoritedBy: 1, participants: 1, source: 1,
        },
      },
    )
    .toArray();

  const verdict = reconcileSourceEvents({ incoming: events, existing, now, failedSourceUrls });

  const operations: AnyBulkWriteOperation<EventDocument>[] = [
    ...verdict.toInsert.map((event) => ({
      insertOne: { document: toInsertedEvent(lairId, event) },
    })),
    // `lairId` sur chaque filtre, en plus de l'`id` : une écriture groupée
    // ne doit pas pouvoir sortir du lieu qu'on rafraîchit.
    ...verdict.toUpdate.map(({ existing: match, patch }) => ({
      updateOne: { filter: { id: match.id, lairId }, update: toPatchUpdate(patch) },
    })),
    ...verdict.toCancel.map((event) => ({
      updateOne: {
        filter: { id: event.id, lairId },
        update: { $set: { status: 'cancelled' as const, boardsNeedsUpdate: true } },
      },
    })),
  ];

  const removedIds = verdict.toDelete.map((event) => event.id);

  if (operations.length > 0 || removedIds.length > 0) {
    const session = db.client.startSession();

    try {
      await session.withTransaction(async () => {
        if (operations.length > 0) {
          await db.collection<EventDocument>(COLLECTION_NAME).bulkWrite(operations, { session, ordered: false });
        }

        if (removedIds.length > 0) {
          await db.collection<EventDocument>(COLLECTION_NAME).deleteMany({ id: { $in: removedIds }, lairId }, { session });
          // Ce que `deleteEvent` retire avec un événement : rien de tout cela
          // n'a de sens sans lui.
          await db.collection("event-portal-settings").deleteMany({ eventId: { $in: removedIds } }, { session });
          await db.collection("matches").deleteMany({ eventId: { $in: removedIds } }, { session });
          await db.collection("event-announcements").deleteMany({ eventId: { $in: removedIds } }, { session });
          await db.collection("event-player-notes").deleteMany({ eventId: { $in: removedIds } }, { session });
        }
      });
    } finally {
      await session.endSession();
    }
  }

  return {
    inserted: verdict.toInsert.length,
    updated: verdict.toUpdate.length,
    unchanged: verdict.unchanged.length,
    cancelled: verdict.toCancel.length,
    removed: removedIds.length,
  };
}

/** Un événement moissonné, tel qu'on l'écrit la première fois. */
function toInsertedEvent(lairId: string, event: SourceEvent): EventDocument {
  return {
    id: crypto.randomUUID(),
    lairId,
    name: event.name,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    gameName: event.gameName,
    ...(event.price !== undefined ? { price: event.price } : {}),
    status: event.status,
    ...(event.url !== undefined ? { url: event.url } : {}),
    addedBy: event.addedBy,
    source: {
      url: event.sourceUrl,
      ...(event.externalId !== undefined ? { externalId: event.externalId } : {}),
    },
  };
}

/**
 * Le `$set` / `$unset` d'un événement retrouvé.
 *
 * Les champs absents sont **retirés**, pas écrits à `null` : un prix qui
 * disparaît de la source doit disparaître de l'événement, et le pilote écrit
 * `undefined` comme `null` si on le laisse faire.
 */
function toPatchUpdate(patch: SourceEventPatch): UpdateFilter<EventDocument> {
  const set: Record<string, unknown> = { boardsNeedsUpdate: true };
  const unset: Record<string, ''> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'source') continue;
    if (value === undefined) {
      unset[key] = '';
    } else {
      set[key] = value;
    }
  }

  if (patch.source) {
    set.source = {
      url: patch.source.url,
      ...(patch.source.externalId !== undefined ? { externalId: patch.source.externalId } : {}),
    };
  }

  return Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set };
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
  gameId: string = "followed",
  month?: number,
  year?: number,
  userLocation?: { latitude: number; longitude: number },
  maxDistanceKm?: number,
  { afterDate, beforeDate }: { afterDate?: string; beforeDate?: string } = {},
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
          ...(lairs && lairs.length > 0 ? [{lairId: {$in: lairs}}] : []),
          // Private events where user is the creator
          {lairId: null, creatorId: userId},
          // Private events where user is a participant
          {lairId: null, participants: userId},
          // Events favorited by the user
          {favoritedBy: userId}
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
  if (afterDate) {
    pipeline.push({
      $match: {
        startDateTime: {
          $gte: afterDate,
        }
      }
    });
  }
  if (beforeDate) {
    pipeline.push({
      $match: {
        startDateTime: {
          $lte: beforeDate,
        }
      }
    });
  }

  // Apply game filter
  if (gameId !== "all") {
    if (gameId === "followed") {
      // Filter by user's followed games
      if (!user.games || user.games.length === 0) {
        // Si l'utilisateur ne suit aucun jeu, on ne montre que les événements privés et favoris
        pipeline.push({
          $match: {
            $or: [
              // Private events where user is the creator
              {lairId: null, creatorId: userId},
              // Private events where user is a participant
              {lairId: null, participants: userId},
              // Favorited events
              {favoritedBy: userId}
            ]
          }
        });
      } else {
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
              let: {eventGameName: "$gameName"},
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        {$eq: ["$name", "$$eventGameName"]},
                        {$in: ["$_id", gameObjectIds]}
                      ]
                    }
                  }
                },
                {
                  $project: {
                    _id: 1,
                    name: 1,
                    icon: 1,
                    banner: 1,
                    slug: 1,
                    type: 1,
                  }
                }
              ],
              as: "game"
            }
          },
          // Only keep events that have a matching game, or private/favorited events
          {
            $match: {
              $or: [
                // Events from followed lairs with matching games
                {game: {$ne: []}},
                // Private events where user is the creator
                {lairId: null, creatorId: userId},
                // Private events where user is a participant
                {lairId: null, participants: userId},
                // Favorited events (always shown regardless of game filter)
                {favoritedBy: userId}
              ]
            }
          },
          {
            $unwind: {
              path: "$game",
              preserveNullAndEmptyArrays: true,
            },
          },
        );
      }
    } else {
      // Filter by specific game ID
      try {
        const gameObjectId = new ObjectId(gameId);

        // Add lookup stage to join with games collection
        pipeline.push(
          // Lookup games to get game by specific ID
          {
            $lookup: {
              from: "games",
              let: {eventGameName: "$gameName"},
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        {$eq: ["$name", "$$eventGameName"]},
                        {$eq: ["$_id", gameObjectId]}
                      ]
                    }
                  }
                },
                {
                  $project: {
                    _id: 1,
                    name: 1,
                    icon: 1,
                    banner: 1,
                    slug: 1,
                    type: 1,
                  }
                }
              ],
              as: "game"
            }
          },
          // Only keep events that have a matching game, or private/favorited events
          {
            $match: {
              $or: [
                // Events with the specific game
                {game: {$ne: []}},
                // Private events where user is the creator
                {lairId: null, creatorId: userId},
                // Private events where user is a participant
                {lairId: null, participants: userId},
                // Favorited events
                {favoritedBy: userId}
              ]
            }
          },
          {
            $unwind: {
              path: "$game",
              preserveNullAndEmptyArrays: true,
            },
          },
        );
      } catch (e) {
        console.error(`Invalid game ID: ${gameId}`);
        return [];
      }
    }
  }

  // Add lookup to get lair details
  pipeline.push({
    $lookup: {
      from: "lairs",
      let: {lairId: {$toObjectId: "$lairId"}},
      pipeline: [
        {
          $match: {
            $expr: {$eq: ["$_id", "$$lairId"]}
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
      let: {creatorId: "$creatorId"},
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                {$eq: ["$_id", {$toObjectId: "$$creatorId"}]}
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
    game: event.game,
    url: event.url,
    price: event.price,
    status: event.status,
    addedBy: event.addedBy,
    participants: event.participants,
    participantRegistrations: event.participantRegistrations,
    preRegistration: event.preRegistration,
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
      $match: {id: eventId}
    },
    {
      $lookup: {
        from: "lairs",
        let: {lairId: {$toObjectId: "$lairId"}},
        pipeline: [
          {
            $match: {
              $expr: {$eq: ["$_id", "$$lairId"]}
            }
          }
        ],
        as: "lairDetails"
      }
    },
    {
      $lookup: {
        from: "user",
        let: {creatorId: "$creatorId"},
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {$eq: ["$_id", {$toObjectId: "$$creatorId"}]}
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
    .project({_id: 0})
    .toArray();

  if (events.length === 0) {
    return null;
  }

  const event = events[0];
  return {
    id: event.id,
    lairId: event.lairId,
    name: event.name,
    description: event.description,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    gameName: event.gameName,
    url: event.url,
    price: event.price,
    status: event.status,
    addedBy: event.addedBy,
    creatorId: event.creatorId,
    creator: event.creator && event.creator.length > 0 ? {
      ...event.creator[0],
      id: event.creator[0]._id.toString(),
      _id: undefined
    } : undefined,
    runningState: event.runningState,
    participants: event.participants,
    participantRegistrations: event.participantRegistrations,
    // Ne compter que les REGISTERED (cf. joinEventAction) : un participant
    // sans statut explicite est REGISTERED par défaut (addParticipantToEvent),
    // mais PRE_REGISTERED/EXCLUDED ne doivent pas compter dans le remplissage.
    registeredParticipantsCount: (event.participants ?? []).filter(
      (userId: string) => (event.participantRegistrations?.[userId] ?? 'REGISTERED') === 'REGISTERED'
    ).length,
    preRegistration: event.preRegistration,
    maxParticipants: event.maxParticipants,
    favoritedBy: event.favoritedBy,
    allowJoin: event.allowJoin,
    lair: event.lairDetails && event.lairDetails.length > 0 ? {
      id: event.lairDetails[0]._id.toString(),
      name: event.lairDetails[0].name,
      location: event.lairDetails[0].location,
      address: event.lairDetails[0].address,
    } : undefined,
    staff: event.staff ?? [],
  };
}

/**
 * Marge de sécurité du filtre de dates de `countUserAttendanceBetween`.
 *
 * `startDateTime` n'est pas stocké dans une forme unique : `refresh-events`
 * écrit ce que rend `DateTime.toISO()` en Europe/Paris — donc un décalage
 * explicite, `…+01:00` — tandis que `event.schema.ts` impose `z.string()
 * .datetime()`, qui exige la forme `Z`. Comparer ces deux formes caractère
 * par caractère revient à comparer une heure locale à un instant UTC : un
 * événement du 31 octobre à 23 h à Paris (22 h UTC) sort après une borne
 * écrite `…22:59:59Z` et se retrouve écarté à tort.
 *
 * D'où la marge : la requête ratisse un peu large — elle reste indexable —
 * et le tri fin se fait en mémoire, sur des instants réellement analysés.
 * Une journée couvre tous les décalages en usage.
 */
const ATTENDANCE_SCAN_MARGIN_MS = 24 * 60 * 60 * 1000;

/**
 * Compte les événements d'une période auxquels un utilisateur a participé.
 *
 * Sert le défi de saison : on compte des présences, pas des intentions. Seul
 * un `REGISTERED` compte donc — un participant sans statut explicite l'est
 * par défaut (`addParticipantToEvent`), mais un `PRE_REGISTERED` qui n'a
 * jamais confirmé n'est venu à rien, et un `EXCLUDED` encore moins. C'est la
 * règle de `registeredParticipantsCount`, à laquelle s'ajoutent deux
 * exclusions propres à un bilan :
 *
 * — les événements annulés, qui n'ont pas eu lieu ;
 * — ceux qui n'ont pas encore commencé, qu'on ne peut pas porter au crédit de
 *   quelqu'un avant qu'ils arrivent.
 *
 * @param userId - L'utilisateur dont on fait le bilan
 * @param from - Début de la période, inclus
 * @param to - Fin de la période, incluse
 * @param now - Instant de référence pour « déjà commencé ». Par défaut, maintenant.
 * @returns Le nombre d'événements retenus
 */
export async function countUserAttendanceBetween(
  userId: string,
  from: Date,
  to: Date,
  now: Date = new Date()
): Promise<number> {
  const events = await db.collection<EventDocument>(COLLECTION_NAME)
    .find(
      {
        participants: userId,
        status: {$ne: 'cancelled'},
        startDateTime: {
          $gte: new Date(from.getTime() - ATTENDANCE_SCAN_MARGIN_MS).toISOString(),
          $lte: new Date(to.getTime() + ATTENDANCE_SCAN_MARGIN_MS).toISOString(),
        },
      },
      // Seuls ces deux champs décident du compte : inutile de tirer des
      // documents entiers pour n'en lire que le statut d'inscription.
      {projection: {startDateTime: 1, participantRegistrations: 1}}
    )
    .toArray();

  const fromMs = from.getTime();
  const toMs = to.getTime();
  const nowMs = now.getTime();

  return events.filter((event) => {
    // `fromISO` lit les deux formes et rend le même instant : c'est ici, et
    // pas dans la requête, que la période est vraiment tranchée.
    const start = DateTime.fromISO(event.startDateTime);
    if (!start.isValid) return false;

    const startMs = start.toMillis();
    if (startMs < fromMs || startMs > toMs || startMs > nowMs) return false;

    return (event.participantRegistrations?.[userId] ?? 'REGISTERED') === 'REGISTERED';
  }).length;
}

/**
 * Add a participant to an event
 * @param eventId - The event's UUID
 * @param userId - The user's ID
 * @param registrationStatus - The registration status (defaults to REGISTERED)
 * @returns True if the participant was added, false otherwise
 */
export async function addParticipantToEvent(eventId: string, userId: string, registrationStatus: RegistrationStatus = 'REGISTERED'): Promise<boolean> {
  const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    {id: eventId},
    {
      $addToSet: {participants: userId},
      $set: {[`participantRegistrations.${userId}`]: registrationStatus, boardsNeedsUpdate: true},
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
    {id: eventId},
    {
      $pull: {participants: userId},
      $unset: {[`participantRegistrations.${userId}`]: ""},
      $set: {boardsNeedsUpdate: true},
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Update a participant's registration status
 * @param eventId - The event's UUID
 * @param userId - The user's ID
 * @param status - The new registration status
 * @returns True if the status was updated, false otherwise
 */
export async function updateParticipantRegistrationStatus(
  eventId: string,
  userId: string,
  status: RegistrationStatus
): Promise<boolean> {
  const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    {id: eventId, participants: userId},
    {
      $set: {[`participantRegistrations.${userId}`]: status, boardsNeedsUpdate: true},
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
    {id: eventId},
    {
      $addToSet: {favoritedBy: userId}
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
    {id: eventId},
    {
      $pull: {favoritedBy: userId}
    }
  );

  return result.modifiedCount > 0;
}

// =====================
// STAFF DE L'ÉVÉNEMENT
// =====================

/**
 * Add a staff member to an event
 * @param eventId - The event's UUID
 * @param userId - The user's ID to add as staff
 * @param role - The staff role ('organizer' or 'judge')
 * @returns True if the staff was added, false otherwise
 */
export async function addStaffToEvent(eventId: string, userId: string, role: 'organizer' | 'judge'): Promise<boolean> {
  // First remove any existing staff entry for this user (to avoid duplicates)
  await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    {id: eventId},
    {$pull: {staff: {userId}}}
  );

  const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    {id: eventId},
    {$push: {staff: {userId, role}}}
  );

  return result.modifiedCount > 0;
}

/**
 * Remove a staff member from an event
 * @param eventId - The event's UUID
 * @param userId - The user's ID to remove from staff
 * @returns True if the staff was removed, false otherwise
 */
export async function removeStaffFromEvent(eventId: string, userId: string): Promise<boolean> {
  const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    {id: eventId},
    {$pull: {staff: {userId}}}
  );

  return result.modifiedCount > 0;
}

/**
 * Update a staff member's role on an event
 * @param eventId - The event's UUID
 * @param userId - The user's ID
 * @param role - The new role
 * @returns True if the role was updated, false otherwise
 */
export async function updateStaffRole(eventId: string, userId: string, role: 'organizer' | 'judge'): Promise<boolean> {
  const result = await db.collection<EventDocument>(COLLECTION_NAME).updateOne(
    {id: eventId, "staff.userId": userId},
    {$set: {"staff.$.role": role}}
  );

  return result.modifiedCount > 0;
}