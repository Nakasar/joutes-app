import db from "@/lib/mongodb";
import { Notification } from "@/lib/types/Notification";
import { ObjectId } from "mongodb";
import { getUserById } from "./users";
import { getLairById } from "./lairs";

const COLLECTION_NAME = "notifications";

export type NotificationDocument = Notification;

/**
 * Récupère toutes les notifications visibles par un utilisateur
 * @param userId - L'ID de l'utilisateur
 * @param options - Options de pagination
 * @returns Array de notifications avec informations de contexte (lair/event) et le total
 */
export async function getUserNotifications(
  userId: string, 
  options?: { page?: number; limit?: number }
): Promise<{ notifications: any[]; total: number }> {
  try {
    const collection = db.collection<NotificationDocument>(COLLECTION_NAME);
    const user = await getUserById(userId);

    if (!user) {
      throw new Error("Utilisateur non trouvé");
    }

    // Récupérer les lairs suivis et possédés par l'utilisateur
    const followedLairIds = user.lairs || [];
    const ownedLairIds: string[] = [];

    // Récupérer les lairs possédés par l'utilisateur
    for (const lairId of followedLairIds) {
      const lair = await getLairById(lairId);
      if (lair && lair.owners?.includes(userId)) {
        ownedLairIds.push(lairId);
      }
    }

    // Construire l'aggregation avec lookups
    const matchStage = {
      $match: {
        // Exclure les notifications masquées par l'utilisateur
        hiddenBy: { $ne: userId },
        $or: [
          { type: 'user', userId },
          { type: 'lair', lairId: { $in: ownedLairIds }, target: { $in: ['owners', 'all'] } },
          { type: 'lair', lairId: { $in: followedLairIds }, target: { $in: ['followers', 'all'] } },
          { type: 'event', eventId: { $exists: true }, target: { $in: ['participants', 'all'] } },
          { type: 'event', eventId: { $exists: true }, target: { $in: ['creator', 'all'] } },
        ]
      }
    };

    const pipeline: any[] = [
      // Match des notifications pertinentes
      matchStage,
      // Lookup pour les lairs
      {
        $lookup: {
          from: 'lairs',
          let: { lairId: '$lairId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$id', '$$lairId'] }
              }
            },
            {
              $project: {
                id: 1,
                name: 1
              }
            }
          ],
          as: 'lairDetails'
        }
      },
      // Lookup pour les événements
      {
        $lookup: {
          from: 'events',
          let: { eventId: '$eventId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$id', '$$eventId'] }
              }
            },
            {
              $project: {
                id: 1,
                name: 1,
                participants: 1,
                creatorId: 1
              }
            }
          ],
          as: 'eventDetails'
        }
      },
      // Unwind optionnel pour lairDetails et eventDetails
      {
        $addFields: {
          lair: { $arrayElemAt: ['$lairDetails', 0] },
          event: { $arrayElemAt: ['$eventDetails', 0] }
        }
      },
      // Suppression des champs temporaires
      {
        $project: {
          lairDetails: 0,
          eventDetails: 0
        }
      },
      // Tri par date décroissante
      {
        $sort: { createdAt: -1 }
      }
    ];

    // Compter le total avant pagination
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await collection.aggregate(countPipeline).toArray();
    const totalBeforeFiltering = countResult.length > 0 ? countResult[0].total : 0;

    // Ajouter pagination si demandée
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    if (options?.page || options?.limit) {
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limit });
    }

    const notifications = await collection.aggregate(pipeline).toArray();

    // Filtrer les notifications d'événements selon la participation réelle
    const filteredNotifications = notifications.filter((notification: any) => {
      if (notification.type === 'event' && notification.event) {
        const event = notification.event;
        if (notification.target === 'participants' && event.participants?.includes(userId)) {
          return true;
        } else if (notification.target === 'creator' && event.creatorId === userId) {
          return true;
        } else if (notification.target === 'all' && (event.participants?.includes(userId) || event.creatorId === userId)) {
          return true;
        }
        return false;
      }
      return true;
    });

    const formattedNotifications = filteredNotifications.map(doc => ({
      ...doc,
      id: doc.id || doc._id?.toString() || '',
    }));

    return {
      notifications: formattedNotifications,
      total: totalBeforeFiltering
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
export async function createNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'readBy'>): Promise<Notification> {
  try {
    const collection = db.collection<NotificationDocument>(COLLECTION_NAME);

    const notificationDoc: any = {
      ...notification,
      id: new ObjectId().toString(),
      createdAt: new Date().toISOString(),
      readBy: [],
    };

    await collection.insertOne(notificationDoc);

    return notificationDoc;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
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
 * Marque toutes les notifications d'un utilisateur comme lues
 * @param userId - L'ID de l'utilisateur
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  try {
    const result = await getUserNotifications(userId);
    const collection = db.collection<NotificationDocument>(COLLECTION_NAME);

    // Marquer toutes les notifications comme lues
    await collection.updateMany(
      { id: { $in: result.notifications.map(n => n.id) } },
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
