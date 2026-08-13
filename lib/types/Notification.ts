import type { Event } from "./Event";
import type { Lair } from "./Lair";

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
  /**
   * Où mène la notification : un **chemin relatif** de Joutes (`/trades/xxx`),
   * jamais une adresse complète. Le site le passe à `next/link`, l'app mobile
   * le retraduit en route à elle.
   *
   * Absent, la destination se dérive de la cible (`lib/notifications/deeplink.ts`).
   * Le champ existe pour ce que la cible ne dit pas : un échange, un tournoi.
   */
  link?: string;
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
