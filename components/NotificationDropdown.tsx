"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Notification } from "@/lib/types/Notification";
import { DateTime } from "luxon";
import Link from "next/link";
import { markNotificationAsReadAction, getRecentNotificationsAction } from "@/app/notifications/actions";
import { useState, useEffect } from "react";

type NotificationDropdownProps = {
  userId: string;
};

export function NotificationDropdown({ userId }: NotificationDropdownProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadNotifications = async () => {
      const result = await getRecentNotificationsAction(5);
      if (result.success) {
        setNotifications(result.notifications || []);
        setUnreadCount(result.unreadCount || 0);
      }
      setIsLoading(false);
    };

    loadNotifications();
  }, []);

  const handleNotificationClick = async (notificationId: string, isRead: boolean) => {
    if (!isRead) {
      await markNotificationAsReadAction(notificationId);
      setUnreadCount(prev => Math.max(0, prev - 1));
      // Mettre à jour la notification dans la liste
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { ...n, readBy: [...(n.readBy || []), userId] }
            : n
        )
      );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white font-semibold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isLoading ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            Chargement...
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            Aucune notification
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.map((notification) => {
              const isRead = notification.readBy?.includes(userId);
              const timeAgo = DateTime.fromISO(notification.createdAt).setLocale('fr').toRelative() || 'à l&apos;instant';
              
              return (
                <DropdownMenuItem
                  key={notification.id}
                  className="cursor-pointer flex-col items-start p-3 focus:bg-accent"
                  onClick={() => handleNotificationClick(notification.id, !!isRead)}
                >
                  <div className="flex items-start gap-2 w-full">
                    <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${isRead ? 'bg-transparent' : 'bg-blue-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isRead ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {notification.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {timeAgo}
                      </p>
                    </div>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications" className="w-full text-center cursor-pointer text-primary font-medium">
            Tout voir
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
