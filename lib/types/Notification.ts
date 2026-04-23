import { Event } from "./Event";
import { Lair } from "./Lair";

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

export type NotificationTemplate =
  | "league-match-result-confirmation-request"
  | "league-match-lair-confirmation-request"
  | "league-match-assigned";

export type Notification = {
  type: string;
  id: string;
  title: string;
  description: string;
  createdAt: string;
  template?: NotificationTemplate;
  leagueId?: string;
  matchId?: string;
  readBy?: string[];
  hiddenBy?: string[];
  lair?: Pick<Lair, "id" | "name">;
  event?: Pick<Event, "id" | "name">;
} & NotificationTarget;
export type UserNotification = Notification & { type: 'user'; userId: string; };
export type LairNotification = Notification & { type: 'lair'; lairId: string; target: 'owners' | 'followers' | 'all'; };
export type EventNotification = Notification & { type: 'event'; eventId: string; target: 'participants' | 'creator' | 'all'; };
export type NewNotification = Omit<Notification & { userId?: string; lairId?: string; eventId?: string; target?: string }, 'id' | 'createdAt' | 'readBy' | 'hiddenBy'>;
