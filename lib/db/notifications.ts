import db from "@/lib/mongodb";
import { Notification } from "@/lib/types/Notification";
import { ObjectId } from "mongodb";
import { getUserById } from "./users";
import { getLairById } from "./lairs";
import { getEventById } from "./events";

const COLLECTION_NAME = "notifications";

export type NotificationDocument = Notification;

/**
 * Récupère toutes les notifications visibles par un utilisateur
 * @param userId - L'ID de l'utilisateur
 * @returns Array de notifications
 */
export async function getUserNotifications(userId: string): Promise<Notification[]> {
  try {
    const collection = (await db).collection<NotificationDocument>(COLLECTION_NAME);
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

    // Construire la requête pour récupérer les notifications
    const query: any = {
      $or: [
        // Notifications destinées à l'utilisateur directement
        { type: 'user', userId },
        // Notifications destinées aux owners des lairs que l'utilisateur possède
        { type: 'lair', lairId: { $in: ownedLairIds }, target: { $in: ['owners', 'all'] } },
        // Notifications destinées aux followers des lairs que l'utilisateur suit
        { type: 'lair', lairId: { $in: followedLairIds }, target: { $in: ['followers', 'all'] } },
        // Notifications destinées aux participants des événements où l'utilisateur participe
        { type: 'event', eventId: { $exists: true }, target: { $in: ['participants', 'all'] } },
        // Notifications destinées au créateur des événements créés par l'utilisateur
        { type: 'event', eventId: { $exists: true }, target: { $in: ['creator', 'all'] } },
      ]
    };

    const notifications = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    // Filtrer les notifications d'événements selon la participation réelle
    const filteredNotifications = [];
    for (const notification of notifications) {
      if (notification.type === 'event') {
        const event = await getEventById(notification.eventId);
        if (!event) continue;

        if (notification.target === 'participants' && event.participants?.includes(userId)) {
          filteredNotifications.push(notification);
        } else if (notification.target === 'creator' && event.creatorId === userId) {
          filteredNotifications.push(notification);
        } else if (notification.target === 'all' && (event.participants?.includes(userId) || event.creatorId === userId)) {
          filteredNotifications.push(notification);
        }
      } else {
        filteredNotifications.push(notification);
      }
    }

    return filteredNotifications.map(doc => ({
      ...doc,
      id: doc.id || doc._id?.toString() || '',
    }));
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
    const collection = (await db).collection<NotificationDocument>(COLLECTION_NAME);

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
    const collection = (await db).collection<NotificationDocument>(COLLECTION_NAME);

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
    const notifications = await getUserNotifications(userId);
    const collection = (await db).collection<NotificationDocument>(COLLECTION_NAME);

    // Marquer toutes les notifications comme lues
    await collection.updateMany(
      { id: { $in: notifications.map(n => n.id) } },
      { $addToSet: { readBy: userId } }
    );
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    throw error;
  }
}

/**
 * Supprime une notification
 * @param notificationId - L'ID de la notification
 */
export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    const collection = (await db).collection<NotificationDocument>(COLLECTION_NAME);

    await collection.deleteOne({ id: notificationId });
  } catch (error) {
    console.error("Error deleting notification:", error);
    throw error;
  }
}
