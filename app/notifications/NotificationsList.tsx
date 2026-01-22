"use client";

import { Notification } from "@/lib/types/Notification";
import { NotificationItem } from "./NotificationItem";
import { useState } from "react";
import { markAllNotificationsAsReadAction, getNotificationsAction } from "./actions";
import { CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type NotificationsListProps = {
  initialNotifications: any[];
  userId: string;
  initialPage: number;
  initialTotal: number;
  limit: number;
};

export function NotificationsList({ initialNotifications, userId, initialPage, initialTotal, limit }: NotificationsListProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);

  const totalPages = Math.ceil(total / limit);
  const unreadCount = notifications.filter(n => !n.readBy?.includes(userId)).length;

  const loadPage = async (newPage: number) => {
    setIsLoading(true);
    const result = await getNotificationsAction(newPage, limit);
    if (result.success && result.notifications) {
      setNotifications(result.notifications);
      setPage(newPage);
      setTotal(result.total || 0);
    }
    setIsLoading(false);
  };

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
    setNotifications([...notifications]);
  };

  const handleNotificationHide = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setTotal(prev => prev - 1);
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
          <span className="text-gray-400 ml-2">• {total} au total</span>
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
            onHide={() => handleNotificationHide(notification.id)}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPage(page - 1)}
            disabled={page <= 1 || isLoading}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Précédent
          </Button>
          
          <span className="text-sm text-gray-600">
            Page {page} sur {totalPages}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPage(page + 1)}
            disabled={page >= totalPages || isLoading}
          >
            Suivant
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
