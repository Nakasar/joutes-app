import db from "@/lib/mongodb";
import { NewNotification, Notification } from "@/lib/types/Notification";
import { Document, ObjectId } from "mongodb";
import { getUserById } from "./users";
import { schedulePushFanout } from "@/lib/push/dispatch";

const COLLECTION_NAME = "notifications";

export type NotificationDocument = Notification;

/**
 * Les étapes qui décident **ce qu'un utilisateur a le droit de voir**, et rien
 * d'autre.
 *
 * Elles étaient noyées au milieu des jointures d'enrichissement — ligues,
 * matchs, joueurs — que la lecture d'une page réclame mais qu'un simple compte
 * n'a que faire. Les isoler donne deux choses : un pipeline de comptage qui ne
 * paie plus ces jointures, et une seule écriture des règles d'accès, au lieu
 * d'une copie par usage.
 *
 * Le miroir de ce `$match`, côté sortant, est `lib/notifications/audience.ts` :
 * les deux doivent dire la même chose, sans quoi un push atteindrait quelqu'un
 * à qui le site ne montre rien.
 */
function notificationAccessStages(userId: string, followedLairIds: string[]): Document[] {
  return [
    // Ce que l'utilisateur a masqué ne le concerne plus.
    { $match: { hiddenBy: { $ne: userId } } },
    {
      $lookup: {
        from: 'lairs',
        let: { lairId: '$lairId' },
        pipeline: [{ $match: { $expr: { $eq: ['$_id', { $toObjectId: '$$lairId' }] } } }],
        as: 'lairDetails',
      },
    },
    {
      $lookup: {
        from: 'events',
        let: { eventId: '$eventId' },
        pipeline: [{ $match: { $expr: { $eq: ['$id', '$$eventId'] } } }],
        as: 'eventDetails',
      },
    },
    {
      $addFields: {
        lair: { $arrayElemAt: ['$lairDetails', 0] },
        event: { $arrayElemAt: ['$eventDetails', 0] },
      },
    },
    {
      $match: {
        $or: [
          { type: 'user', userId },
          { type: 'lair', target: { $in: ['owners', 'all'] }, 'lair.owners': userId },
          { type: 'lair', target: { $in: ['followers', 'all'] }, lairId: { $in: followedLairIds } },
          { type: 'event', target: { $in: ['participants', 'all'] }, 'event.participants': userId },
          { type: 'event', target: { $in: ['creator', 'all'] }, 'event.creatorId': userId },
        ],
      },
    },
  ];
}

/**
 * Récupère toutes les notifications visibles par un utilisateur
 * @param userId - L'ID de l'utilisateur
 * @param options - Options de pagination
 * @returns Array de notifications avec informations de contexte (lair/event) et le total
 */
export async function getUserNotifications(
  userId: string, 
  options?: { page?: number; limit?: number }
): Promise<{ notifications: Notification[]; total: number }> {
  try {
    const collection = db.collection<NotificationDocument>(COLLECTION_NAME);
    const user = await getUserById(userId);

    if (!user) {
      throw new Error("Utilisateur non trouvé");
    }

    const followedLairIds = user.lairs || [];

    const pipeline: Document[] = [
      // Qui a le droit de voir quoi, d'abord : les jointures d'enrichissement
      // qui suivent ne travaillent alors que sur ce qui reste.
      ...notificationAccessStages(userId, followedLairIds),
      {
        $addFields: {
          leagueObjectId: {
            $convert: { input: "$leagueId", to: "objectId", onError: null, onNull: null },
          },
          matchObjectId: {
            $convert: { input: "$matchId", to: "objectId", onError: null, onNull: null },
          },
        }
      },
      {
        $lookup: {
          from: 'leagues',
          localField: 'leagueObjectId',
          foreignField: '_id',
          as: 'leagueDetails',
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
              },
            },
          ],
        }
      },
      {
        $lookup: {
          from: 'matches',
          foreignField: '_id',
          localField: 'matchObjectId',
          as: 'matchDetails',
          pipeline: [
            {
              $project: {
                _id: 1,
                gameId: 1,
                lairId: 1,
                playedAt: 1,
                playerIds: 1,
                winnerIds: 1,
                status: 1,
                reportedBy: 1,
                reportedAt: 1,
                confirmedBy: 1,
                confirmedPlayerIds: 1,
                confirmedAt: 1,
                lairConfirmedBy: 1,
              },
            },
          ],
        }
      },
      {
        $addFields: {
          league: { $arrayElemAt: ['$leagueDetails', 0] },
          match: { $arrayElemAt: ['$matchDetails', 0] }
        }
      },
      {
        $lookup: {
          from: 'user',
          let: { playerIds: '$match.playerIds' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: [
                    '$_id',
                    {
                      $map: {
                        input: { $ifNull: ['$$playerIds', []] },
                        as: 'pid',
                        in: {
                          $convert: {
                            input: '$$pid',
                            to: 'objectId',
                            onError: null,
                            onNull: null,
                          }
                        }
                      }
                    }
                  ]
                }
              }
            },
            {
              $project: {
                _id: 1,
                username: 1,
                displayName: 1,
                discriminator: 1,
                avatar: 1,
              }
            }
          ],
          as: 'matchPlayers'
        }
      },
      // Projeter uniquement les champs nécessaires
      {
        $project: {
          lairDetails: 0,
          eventDetails: 0,
          leagueDetails: 0,
          matchDetails: 0,
          leagueObjectId: 0,
          matchObjectId: 0,
        }
      },
      // Tri par date décroissante
      {
        $sort: { createdAt: -1 }
      }
    ];

    // Le total se compte sur les seules étapes d'accès : joindre les ligues,
    // les matchs et leurs joueurs pour n'en garder qu'un nombre était payer
    // deux fois l'enrichissement d'une page qu'on ne rend qu'une.
    const countResult = await collection
      .aggregate([...notificationAccessStages(userId, followedLairIds), { $count: 'total' }])
      .toArray();
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Ajouter la pagination
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const notifications = await collection.aggregate(pipeline).toArray();

    // Formater les notifications
    const formattedNotifications = notifications.map(doc => ({
      ...doc,
      _id: undefined,
      id: doc.id || doc._id?.toString() || '',
      lair: doc.lair ? { 
        _id: undefined, 
        id: doc.lair._id?.toString() || doc.lair.id, 
        name: doc.lair.name 
      } : undefined,
      event: doc.event ? { 
        _id: undefined, 
        id: doc.event.id, 
        name: doc.event.name 
      } : undefined,
      league: doc.league ? {
        _id: undefined,
        id: doc.league._id?.toString() || doc.league.id,
        name: doc.league.name,
      } : undefined,
      match: doc.match ? {
        id: doc.match._id?.toString(),
        gameId: doc.match.gameId,
        lairId: doc.match.lairId,
        playedAt: doc.match.playedAt,
        playerIds: doc.match.playerIds,
        winnerIds: doc.match.winnerIds,
        status: doc.match.status,
        reportedBy: doc.match.reportedBy,
        reportedAt: doc.match.reportedAt,
        confirmedBy: doc.match.confirmedBy,
        confirmedPlayerIds: doc.match.confirmedPlayerIds,
        lairConfirmedBy: doc.match.lairConfirmedBy,
        confirmedAt: doc.match.confirmedAt,
      } : undefined,
      matchPlayers: doc.matchPlayers?.map((player: { _id?: ObjectId; id?: string; username?: string; displayName?: string; discriminator?: string; avatar?: string }) => ({
        id: player._id?.toString() || player.id,
        username: player.username,
        displayName: player.displayName,
        discriminator: player.discriminator,
        avatar: player.avatar,
      })) || [],
      readBy: doc.readBy?.includes(userId) ? [userId] : [],
    })) as unknown as Notification[];

    return {
      notifications: formattedNotifications,
      total
    };
  } catch (error) {
    console.error("Error fetching user notifications:", error);
    throw error;
  }
}

/**
 * Crée une nouvelle notification
 * @param notification - Les données de la notification
 * @returns La notification créée
 */
export async function createNotification(notification: NewNotification): Promise<Notification> {
  try {
    const collection = db.collection<NotificationDocument>(COLLECTION_NAME);

    const notificationDoc = {
      ...notification,
      id: new ObjectId().toString(),
      createdAt: new Date().toISOString(),
      readBy: [] as string[],
    } as Notification;

    await collection.insertOne(notificationDoc);

    // Le push part d'ici, et pas d'une enveloppe dans `lib/services` : c'est le
    // seul point d'écriture de la collection. Quatre des neuf fonctions de
    // service sont mortes, et `lib/db/leagues.ts` émet directement — brancher
    // au-dessus laisserait passer tout appel qui ne passe pas par elles.
    //
    // L'appel est délibérément non attendu, et incapable de lever : une
    // notification enregistrée sans push vaut infiniment mieux qu'une demande
    // d'ami annulée parce qu'Apple était indisponible.
    schedulePushFanout(notificationDoc);

    return notificationDoc;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

/**
 * Une notification par son identifiant, sans contrôle d'accès.
 *
 * Réservée au dépilage du push, qui reprend un travail mis en file et n'a
 * besoin que du titre, du corps et de la cible. Toute lecture destinée à un
 * utilisateur passe par `getUserNotifications`, dont le pipeline filtre selon
 * ce à quoi il a droit.
 */
export async function getNotificationById(notificationId: string): Promise<Notification | null> {
  const doc = await db
    .collection<NotificationDocument>(COLLECTION_NAME)
    .findOne({ id: notificationId });

  if (!doc) return null;

  return { ...doc, _id: undefined } as unknown as Notification;
}

/**
 * Marque une notification comme lue par un utilisateur
 * @param notificationId - L'ID de la notification
 * @param userId - L'ID de l'utilisateur
 */
export async function markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
  try {
    const collection = db.collection<NotificationDocument>(COLLECTION_NAME);

    await collection.updateOne(
      { id: notificationId },
      { $addToSet: { readBy: userId } }
    );
  } catch (error) {
    console.error("Error marking notification as read:", error);
    throw error;
  }
}

/**
 * Combien de notifications non lues attendent un utilisateur.
 *
 * La cloche du site comptait jusqu'ici les non-lues de la page qu'elle venait
 * de charger : cinq éléments, donc une pastille qui plafonnait à cinq. Le
 * compteur de l'app mobile a besoin du vrai nombre, et la cloche aussi.
 */
export async function countUnreadNotifications(userId: string): Promise<number> {
  try {
    const user = await getUserById(userId);
    if (!user) return 0;

    const result = await db
      .collection<NotificationDocument>(COLLECTION_NAME)
      .aggregate([
        ...notificationAccessStages(userId, user.lairs || []),
        { $match: { readBy: { $ne: userId } } },
        { $count: 'total' },
      ])
      .toArray();

    return result.length > 0 ? result[0].total : 0;
  } catch (error) {
    console.error("Error counting unread notifications:", error);
    return 0;
  }
}

/**
 * Marque toutes les notifications d'un utilisateur comme lues.
 *
 * Passait par `getUserNotifications` sans options, donc sous sa limite
 * implicite de vingt : « tout marquer comme lu » n'en marquait que vingt, et
 * la pastille revenait aussitôt. Le bouton de l'app mobile allait y passer bien
 * plus souvent que celui du site.
 *
 * On travaille désormais sur les seules étapes d'accès, sans limite et sans
 * enrichissement — c'est une écriture, elle n'a que faire du nom des ligues.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  try {
    const user = await getUserById(userId);
    if (!user) return;

    const collection = db.collection<NotificationDocument>(COLLECTION_NAME);

    const unread = await collection
      .aggregate([
        ...notificationAccessStages(userId, user.lairs || []),
        { $match: { readBy: { $ne: userId } } },
        { $project: { id: 1 } },
      ])
      .toArray();

    if (unread.length === 0) return;

    await collection.updateMany(
      { id: { $in: unread.map((doc) => doc.id) } },
      { $addToSet: { readBy: userId } }
    );
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    throw error;
  }
}

/**
 * Masque une notification pour un utilisateur
 * @param notificationId - L'ID de la notification
 * @param userId - L'ID de l'utilisateur
 */
export async function hideNotification(notificationId: string, userId: string): Promise<void> {
  try {
    const collection = db.collection<NotificationDocument>(COLLECTION_NAME);

    await collection.updateOne(
      { id: notificationId },
      { $addToSet: { hiddenBy: userId } }
    );
  } catch (error) {
    console.error("Error hiding notification:", error);
    throw error;
  }
}

/**
 * Supprime une notification
 * @param notificationId - L'ID de la notification
 */
export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    const collection = db.collection<NotificationDocument>(COLLECTION_NAME);

    await collection.deleteOne({ id: notificationId });
  } catch (error) {
    console.error("Error deleting notification:", error);
    throw error;
  }
}
