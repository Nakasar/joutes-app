import type { Notification } from "@/lib/types/Notification";

/**
 * Destination d'une notification.
 *
 * Une notification n'avait pas de lien : le sien se devinait à l'affichage,
 * dans `app/notifications/NotificationItem.tsx`, qui construisait `/lairs/{id}`
 * ou `/events/{id}` à partir du lair et de l'événement que l'agrégation lui
 * avait joints. Ça suffisait tant que le seul lecteur était la page — mais un
 * push n'a que le document brut, et la devinette est de toute façon incomplète :
 * une notification de ligue vise `/leagues/{leagueId}`, une notification
 * d'échange ne vise rien alors qu'elle devrait ouvrir l'échange.
 *
 * D'où deux choses : un champ `link` que l'émetteur remplit quand il connaît la
 * destination, et cette dérivation en repli pour tout ce qui est déjà en base.
 *
 * À ne pas confondre avec la **pastille de contexte** de `NotificationItem.tsx`,
 * qui reste ce qu'elle est : elle affiche le nom du lair ou de l'événement dont
 * il est question, et pointe vers lui. La destination d'une notification, elle,
 * peut être ailleurs — un échange, un tournoi. Les deux coïncident aujourd'hui
 * pour un lair et un événement ; les fondre ferait pointer la pastille « Lyon
 * Gaming » vers un échange dès qu'une notification porte un `link`.
 *
 * Module pur : c'est ce qui le rend testable.
 */

/** Ce que la dérivation regarde. Un document brut suffit, aucune jointure. */
export type LinkableNotification = Pick<Notification, "type" | "template"> & {
  link?: string;
  leagueId?: string;
  lairId?: string;
  eventId?: string;
  lair?: { id: string } | null;
  event?: { id: string } | null;
};

/**
 * Un lien de notification est un **chemin relatif**, jamais une adresse
 * complète : le site le passe à `next/link`, l'app mobile le retraduit en route
 * à elle. Une URL absolue sortirait l'utilisateur de l'application, et une
 * adresse d'un autre domaine glissée dans une notification en ferait une porte
 * d'hameçonnage.
 */
function isRelativePath(value: unknown): value is string {
  return typeof value === "string" && /^\/(?!\/)[^\s]*$/.test(value);
}

/**
 * Destination d'une notification, ou `null` si elle n'en a pas. L'appelant
 * retombe alors sur la liste des notifications : mieux vaut la liste qu'un lien
 * qui ne mène nulle part.
 *
 * L'ordre compte. Le `link` explicite passe avant tout — c'est l'émetteur qui
 * sait le mieux. Vient ensuite la ligue, car une notification de match de ligue
 * est de type `user` et n'aurait sinon aucune destination. Le lair et
 * l'événement ferment la marche, ce sont les deux seuls que la page savait
 * déjà déduire.
 */
export function notificationLink(notification: LinkableNotification): string | null {
  if (isRelativePath(notification.link)) return notification.link;

  if (notification.template && notification.leagueId) {
    return `/leagues/${notification.leagueId}`;
  }

  if (notification.type === "lair") {
    const lairId = notification.lair?.id ?? notification.lairId;
    if (lairId) return `/lairs/${lairId}`;
  }

  if (notification.type === "event") {
    const eventId = notification.event?.id ?? notification.eventId;
    if (eventId) return `/events/${eventId}`;
  }

  return null;
}
