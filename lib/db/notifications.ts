import db from "@/lib/mongodb";
import { NewNotification, Notification } from "@/lib/types/Notification";
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

    const followedLairIds = user.lairs || [];

    const pipeline: any[] = [
      // Exclure les notifications masquées par l'utilisateur
      {
        $match: {
          hiddenBy: { $ne: userId }
        }
      },
      // Lookup pour les lairs avec vérification des permissions
      {
        $lookup: {
          from: 'lairs',
          let: { lairId: '$lairId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$id', '$$lairId'] }
              }
            }
          ],
          as: 'lairDetails'
        }
      },
      // Lookup pour les événements avec vérification des permissions
      {
        $lookup: {
          from: 'events',
          let: { eventId: '$eventId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$id', '$$eventId'] }
              }
            }
          ],
          as: 'eventDetails'
        }
      },
      // Ajouter les champs lair et event
      {
        $addFields: {
          lair: { $arrayElemAt: ['$lairDetails', 0] },
          event: { $arrayElemAt: ['$eventDetails', 0] }
        }
      },
      // Filtrer selon le type de notification et les permissions
      {
        $match: {
          $or: [
            // Notifications user
            { type: 'user', userId },
            // Notifications lair pour les owners
            { 
              type: 'lair', 
              target: { $in: ['owners', 'all'] },
              'lair.owners': userId
            },
            // Notifications lair pour les followers
            { 
              type: 'lair', 
              target: { $in: ['followers', 'all'] },
              lairId: { $in: followedLairIds }
            },
            // Notifications event pour les participants
            { 
              type: 'event', 
              target: { $in: ['participants', 'all'] },
              'event.participants': userId
            },
            // Notifications event pour le creator
            { 
              type: 'event', 
              target: { $in: ['creator', 'all'] },
              'event.creatorId': userId
            }
          ]
        }
      },
      // Projeter uniquement les champs nécessaires
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

    // Compter le total après filtrage
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await collection.aggregate(countPipeline).toArray();
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
      readBy: doc.readBy?.includes(userId) ? [userId] : [],
    }));

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
