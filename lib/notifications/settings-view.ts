import {
  NOTIFICATION_PREFERENCES,
  type NotificationChannel,
  type NotificationPreferenceType,
} from "@/lib/notifications/preferences";
import type { User } from "@/lib/types/User";

export type NotificationSetting = {
  channel: NotificationChannel;
  type: NotificationPreferenceType;
  enabled: boolean;
  /** Faux quand le réglage ne peut pas s'ouvrir (Discord sans compte lié). */
  available: boolean;
};

/**
 * Les réglages tels que la page `/account/notifications` les montre, mêmes
 * valeurs par défaut comprises : le push est ouvert tant qu'on ne l'a pas
 * coupé, le reste est fermé tant qu'on ne l'a pas ouvert.
 */
export function readNotificationSettings(
  notifications: User["notifications"] | undefined,
  discordLinked: boolean,
): NotificationSetting[] {
  const settings: NotificationSetting[] = [];
  for (const channel of Object.keys(NOTIFICATION_PREFERENCES) as NotificationChannel[]) {
    for (const type of NOTIFICATION_PREFERENCES[channel]) {
      const stored = readStored(notifications, channel, type);
      const available = channel !== "discord" || discordLinked;
      const enabled =
        channel === "app" && type === "push"
          ? stored !== false
          : channel === "discord"
            ? discordLinked && stored === true
            : stored === true;
      settings.push({ channel, type, enabled, available });
    }
  }
  return settings;
}

function readStored(
  notifications: User["notifications"] | undefined,
  channel: NotificationChannel,
  type: NotificationPreferenceType,
): boolean | undefined {
  const byChannel = notifications?.[channel] as Record<string, { enabled?: boolean } | undefined> | undefined;
  return byChannel?.[type]?.enabled;
}
