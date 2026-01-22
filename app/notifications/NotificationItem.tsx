"use client";

import { Notification } from "@/lib/types/Notification";
import { DateTime } from "luxon";
import { Bell, Check, CheckCheck, MapPin, Calendar, X } from "lucide-react";
import { markNotificationAsReadAction, hideNotificationAction } from "./actions";
import { useState } from "react";
import Link from "next/link";

type NotificationItemProps = {
  notification: any; // Utiliser any pour accepter les champs additionnels lair/event
  userId: string;
  onMarkAsRead?: () => void;
  onHide?: () => void;
};

export function NotificationItem({ notification, userId, onMarkAsRead, onHide }: NotificationItemProps) {
  const [isRead, setIsRead] = useState(notification.readBy?.includes(userId) || false);
  const [isMarking, setIsMarking] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  const handleMarkAsRead = async () => {
    if (isRead) return;

    setIsMarking(true);
    const result = await markNotificationAsReadAction(notification.id);
    
    if (result.success) {
      setIsRead(true);
      onMarkAsRead?.();
    }
    setIsMarking(false);
  };

  const handleHide = async () => {
    setIsHiding(true);
    const result = await hideNotificationAction(notification.id);
    
    if (result.success) {
      onHide?.();
    }
    setIsHiding(false);
  };

  const timeAgo = DateTime.fromISO(notification.createdAt).setLocale('fr').toRelative() || 'à l&apos;instant';

  // Déterminer le contexte (lair ou event)
  const contextLink = notification.type === 'lair' && notification.lair 
    ? { href: `/lairs/${notification.lair.id}`, label: notification.lair.name, icon: MapPin }
    : notification.type === 'event' && notification.event
    ? { href: `/events/${notification.event.id}`, label: notification.event.name, icon: Calendar }
    : null;

  return (
    <div 
      className={`p-4 border rounded-lg transition-colors ${
        isRead ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-full ${isRead ? 'bg-gray-100' : 'bg-blue-100'}`}>
          <Bell className={`w-5 h-5 ${isRead ? 'text-gray-500' : 'text-blue-600'}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className={`font-semibold ${isRead ? 'text-gray-700' : 'text-gray-900'}`}>
              {notification.title}
            </h3>
            
            <div className="flex items-center gap-1">
              {!isRead && (
                <button
                  onClick={handleMarkAsRead}
                  disabled={isMarking}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
                  title="Marquer comme lu"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleHide}
                disabled={isHiding}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 disabled:opacity-50"
                title="Masquer cette notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {contextLink && (
            <Link 
              href={contextLink.href}
              className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
            >
              <contextLink.icon className="w-3 h-3" />
              {contextLink.label}
            </Link>
          )}
          
          <p className={`mt-1 text-sm ${isRead ? 'text-gray-600' : 'text-gray-700'}`}>
            {notification.description}
          </p>
          
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <span>{timeAgo}</span>
            {isRead && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <CheckCheck className="w-3 h-3" />
                  Lue
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
