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
  id: string;
  title: string;
  description: string;
  createdAt: string;
  readBy?: string[];
  hiddenBy?: string[];
} & NotificationTarget;
