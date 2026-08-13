import type { User } from "@/lib/types/User";

/**
 * Les réglages de notification, et ce qui est un réglage valide.
 *
 * Le contrôle se faisait par deux appartenances indépendantes — un canal parmi
 * deux, un type parmi deux — ce qui laissait passer des couples qui n'existent
 * nulle part : un « courriel push », un « récapitulatif plateforme ». Rien de
 * grave tant que l'interface était la seule à écrire, mais l'app mobile va
 * appeler la même action, et une matrice se vérifie mieux qu'elle ne se devine.
 *
 * Module pur : c'est ce qui le rend testable.
 */

export const NOTIFICATION_PREFERENCES = {
  emails: ["weekly", "platform"],
  app: ["weekly", "push"],
} as const;

export type NotificationChannel = keyof typeof NOTIFICATION_PREFERENCES;
export type NotificationPreferenceType = "weekly" | "platform" | "push";

/**
 * Un couple canal/type qui existe vraiment.
 *
 * `Object.hasOwn` et pas un simple accès : la chaîne de prototypes répond à
 * `toString`, `constructor` ou `__proto__`, et une saisie venue d'une requête
 * n'a pas à hériter des méthodes d'`Object`.
 */
export function isNotificationPreference(
  channel: string,
  type: string
): channel is NotificationChannel {
  if (!Object.hasOwn(NOTIFICATION_PREFERENCES, channel)) return false;

  const types: readonly string[] = NOTIFICATION_PREFERENCES[channel as NotificationChannel];
  return types.includes(type);
}

/**
 * Le push est-il ouvert pour ce compte ?
 *
 * Absent vaut **activé**, et ce n'est pas une négligence : enregistrer un
 * appareil pose le réglage à `true` au moment où l'utilisateur accepte l'invite
 * du système. Un compte sans appareil n'a de toute façon rien à recevoir, et
 * l'absence ne se rencontre donc que sur les comptes qui n'ont jamais rien
 * accepté. L'interrupteur, lui, sert à couper.
 */
export function isPushEnabledForUser(notifications: User["notifications"] | undefined): boolean {
  return notifications?.app?.push?.enabled !== false;
}
