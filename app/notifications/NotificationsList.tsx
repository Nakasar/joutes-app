"use client";

import { Notification } from "@/lib/types/Notification";
import { NotificationItem } from "./NotificationItem";
import { useState } from "react";
import { markAllNotificationsAsReadAction } from "./actions";
import { CheckCheck } from "lucide-react";

type NotificationsListProps = {
  initialNotifications: Notification[];
  userId: string;
};

export function NotificationsList({ initialNotifications, userId }: NotificationsListProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const unreadCount = notifications.filter(n => !n.readBy?.includes(userId)).length;

  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    const result = await markAllNotificationsAsReadAction();
    
    if (result.success) {
      setNotifications(prev => prev.map(n => ({
        ...n,
        readBy: [...(n.readBy || []), userId]
      })));
    }
    setIsMarkingAll(false);
  };

  const handleNotificationRead = () => {
    // Forcer le rafraîchissement de la liste pour mettre à jour les compteurs
    setNotifications([...notifications]);
  };

  if (notifications.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Aucune notification pour le moment</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {unreadCount > 0 ? (
            <span className="font-medium text-blue-600">
              {unreadCount} notification{unreadCount > 1 ? 's' : ''} non lue{unreadCount > 1 ? 's' : ''}
            </span>
          ) : (
            <span>Toutes les notifications sont lues</span>
          )}
        </div>
        
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            disabled={isMarkingAll}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            <CheckCheck className="w-4 h-4" />
            Tout marquer comme lu
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            userId={userId}
            onMarkAsRead={handleNotificationRead}
          />
        ))}
      </div>
    </div>
  );
}
