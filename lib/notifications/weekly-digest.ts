import type { Event } from "@/lib/types/Event";

/**
 * Le récapitulatif hebdomadaire, et la façon de le dire.
 *
 * Le contenu est le même par courriel et par push — les événements à venir des
 * lieux qu'on suit — mais la forme diffère : un courriel déploie une liste, une
 * alerte de téléphone tient en une phrase. Ce module écrit cette phrase, et la
 * fenêtre que les deux canaux interrogent, pour qu'ils ne divergent pas le jour
 * où l'un des deux évolue.
 *
 * Module pur, sans accès à la base : les crons chargent, il met en mots.
 */

/** Un utilisateur reçoit son récapitulatif au plus une fois par semaine. */
export const WEEKLY_DIGEST_COOLDOWN_DAYS = 6;

/**
 * Le filtre qui écarte ceux qui ont déjà reçu leur récapitulatif.
 *
 * Le champ diffère selon le canal (`notifications.emails.weekly.lastSent` ou
 * `notifications.app.weekly.lastSent`) : chacun a sa mémoire, sans quoi
 * recevoir le courriel priverait du push, et inversement.
 */
export function weeklyDigestFilter(channel: "emails" | "app", before: string) {
  const enabled = `notifications.${channel}.weekly.enabled`;
  const lastSent = `notifications.${channel}.weekly.lastSent`;

  return {
    [enabled]: true,
    $or: [
      { [lastSent]: { $lte: before } },
      { [lastSent]: { $exists: false } },
      { [lastSent]: null },
    ],
  };
}

export type WeeklyDigestEvent = Pick<Event, "name">;

/**
 * Le récapitulatif en une alerte.
 *
 * Rend `null` quand il n'y a rien à annoncer : une notification qui dit « rien
 * cette semaine » est le meilleur moyen de se faire couper les notifications.
 */
export function weeklyDigestPush(
  events: WeeklyDigestEvent[]
): { title: string; body: string } | null {
  if (events.length === 0) return null;

  const names = events
    .slice(0, 3)
    .map((event) => event.name)
    .filter(Boolean);

  const reste = events.length - names.length;
  const liste = reste > 0 ? `${names.join(", ")} et ${reste} autre${reste > 1 ? "s" : ""}` : names.join(", ");

  return {
    title: events.length === 1 ? "Un événement cette semaine" : `${events.length} événements cette semaine`,
    body: liste,
  };
}
