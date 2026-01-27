"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserNotifications, markAllNotificationsAsRead, markNotificationAsRead, hideNotification } from "@/lib/db/notifications";

export async function getNotificationsAction(page: number = 1, limit: number = 20) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté pour voir les notifications" };
    }

    const result = await getUserNotifications(session.user.id, { page, limit });

    return { success: true, notifications: result.notifications, total: result.total, page, limit };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return { success: false, error: "Erreur lors de la récupération des notifications" };
  }
}

export async function getRecentNotificationsAction(limit: number = 5) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté pour voir les notifications", notifications: [] };
    }

    const result = await getUserNotifications(session.user.id, { limit });
    const unreadCount = result.notifications.filter(n => !n.readBy?.includes(session.user.id)).length;

    return { success: true, notifications: result.notifications, unreadCount };
  } catch (error) {
    console.error("Error fetching recent notifications:", error);
    return { success: false, error: "Erreur lors de la récupération des notifications", notifications: [], unreadCount: 0 };
  }
}

export async function markNotificationAsReadAction(notificationId: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté pour marquer une notification comme lue" };
    }

    await markNotificationAsRead(notificationId, session.user.id);

    return { success: true };
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return { success: false, error: "Erreur lors du marquage de la notification" };
  }
}

export async function markAllNotificationsAsReadAction() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté pour marquer les notifications comme lues" };
    }

    await markAllNotificationsAsRead(session.user.id);

    return { success: true };
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return { success: false, error: "Erreur lors du marquage des notifications" };
  }
}

export async function hideNotificationAction(notificationId: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté pour masquer une notification" };
    }

    await hideNotification(notificationId, session.user.id);

    return { success: true };
  } catch (error) {
    console.error("Error hiding notification:", error);
    return { success: false, error: "Erreur lors du masquage de la notification" };
  }
}
