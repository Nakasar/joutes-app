export type UserNotificationTarget = {
  type: 'user';
  userId: string;
};

export type LairNotificationTarget = {
  type: 'lair';
  lairId: string;
  target: 'owners' | 'followers' | 'all';
};

export type EventNotificationTarget = {
  type: 'event';
  eventId: string;
  target: 'participants' | 'creator' | 'all';
};

export type NotificationTarget = UserNotificationTarget | LairNotificationTarget | EventNotificationTarget;

export type Notification = {
  type: string;
  id: string;
  title: string;
  description: string;
  createdAt: string;
  readBy?: string[];
  hiddenBy?: string[];
} & NotificationTarget;
export type UserNotification = Notification & { type: 'user'; userId: string; };
export type LairNotification = Notification & { type: 'lair'; lairId: string; target: 'owners' | 'followers' | 'all'; };
export type EventNotification = Notification & { type: 'event'; eventId: string; target: 'participants' | 'creator' | 'all'; };
export type NewNotification = Omit<Notification & { userId?: string; lairId?: string; eventId?: string; target?: string }, 'id' | 'createdAt' | 'readBy' | 'hiddenBy'>;
