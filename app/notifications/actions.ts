"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserNotifications, markAllNotificationsAsRead, markNotificationAsRead } from "@/lib/db/notifications";

export async function getNotificationsAction() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté pour voir les notifications" };
    }

    const notifications = await getUserNotifications(session.user.id);

    return { success: true, notifications };
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

    const notifications = await getUserNotifications(session.user.id);
    const recentNotifications = notifications.slice(0, limit);
    const unreadCount = notifications.filter(n => !n.readBy?.includes(session.user.id)).length;

    return { success: true, notifications: recentNotifications, unreadCount };
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
