import type { Event, EventHighlights, HighlightFriend } from "@/lib/types/Event";

import { canSeeAttendees } from "./attendees";

/**
 * Ce qui fait remarquer un événement : il est populaire, des amis y vont, ou
 * le lieu l'a choisi.
 *
 * Les trois marques se calculent à la lecture, pour la personne qui regarde ;
 * seule la troisième s'appuie sur un champ stocké (`Event.featured`). Ce
 * module ne lit rien : `highlights-service.ts` lui apporte les documents.
 */

/** Inscrits et intéressés confondus, à partir de combien un événement est populaire. */
export const POPULAR_MIN_INTEREST = 12;
/** Une jauge remplie à ce point est populaire… */
export const POPULAR_FILL_RATIO = 0.75;
/** … pourvu qu'elle compte au moins ce nombre d'inscrits : six sur huit oui, trois sur quatre non. */
export const POPULAR_FILL_MIN = 6;
/** Combien d'événements à venir un lieu peut mettre en avant à la fois. */
export const MAX_LAIR_PICKS = 3;
/** La fenêtre du bloc « À ne pas manquer », en jours. */
export const HIGHLIGHT_WINDOW_DAYS = 14;
/** Combien d'événements le bloc « À ne pas manquer » montre. */
export const MAX_HIGHLIGHTS = 3;

/** Les champs d'un événement dont les marques ont besoin. */
export type HighlightSource = Pick<
  Event,
  | "lairId"
  | "status"
  | "participants"
  | "participantRegistrations"
  | "favoritedBy"
  | "maxParticipants"
  | "waitlist"
  | "featured"
  | "participantsVisibility"
  | "creatorId"
  | "staff"
>;

/** Les inscrits confirmés : une préinscription ou une exclusion ne remplit pas la salle. */
export function registeredIds(event: HighlightSource): string[] {
  return (event.participants ?? []).filter(
    (userId) => (event.participantRegistrations?.[userId] ?? "REGISTERED") === "REGISTERED",
  );
}

/** Inscrits confirmés et intéressés, chacun compté une fois. */
export function interestCount(event: HighlightSource): number {
  const registeredSet = new Set(event.participants ?? []);
  const interested = (event.favoritedBy ?? []).filter((userId) => !registeredSet.has(userId));
  return registeredIds(event).length + interested.length;
}

/**
 * Populaire : beaucoup de monde s'y intéresse, ou la salle se remplit.
 *
 * Un intéressé déjà inscrit ne compte qu'une fois. La jauge ne parle que si
 * l'événement en a une, et une liste d'attente ouverte dit à elle seule que
 * la demande dépasse l'offre.
 */
export function isPopular(event: HighlightSource): boolean {
  if (event.status === "cancelled") return false;

  if (interestCount(event) >= POPULAR_MIN_INTEREST) return true;

  const registered = registeredIds(event);
  const capacity = event.maxParticipants;
  if (
    capacity != null &&
    capacity > 0 &&
    registered.length >= POPULAR_FILL_MIN &&
    registered.length / capacity >= POPULAR_FILL_RATIO
  ) {
    return true;
  }

  return (event.waitlist?.length ?? 0) > 0;
}

/** Choix du lieu : seul un événement rattaché à un lieu, et maintenu, peut l'être. */
export function isLairPick(event: HighlightSource): boolean {
  return Boolean(event.featured && event.lairId && event.status !== "cancelled");
}

/**
 * Les amis de `viewerId` sur l'événement, inscrits d'abord.
 *
 * Un ami inscrit n'apparaît que si la liste « Qui vient ? » est visible de la
 * personne qui regarde : la marque ne doit pas révéler ce que la page de
 * l'événement cache. Les favoris, eux, se montrent aux amis (règle écrite dans
 * la page Confidentialité).
 */
export function friendsOn(
  event: HighlightSource,
  viewerId: string,
  friendIds: ReadonlySet<string>,
  lairOwners: readonly string[] = [],
): { id: string; kind: HighlightFriend["kind"] }[] {
  if (friendIds.size === 0) return [];

  const isManager =
    event.creatorId === viewerId ||
    lairOwners.includes(viewerId) ||
    (event.staff ?? []).some((member) => member.userId === viewerId);
  const isParticipant = (event.participants ?? []).includes(viewerId);
  const attendeesVisible = canSeeAttendees(event.participantsVisibility, { isManager, isParticipant });

  const result: { id: string; kind: HighlightFriend["kind"] }[] = [];
  const seen = new Set<string>();

  if (attendeesVisible) {
    for (const userId of registeredIds(event)) {
      if (friendIds.has(userId) && !seen.has(userId)) {
        seen.add(userId);
        result.push({ id: userId, kind: "registered" });
      }
    }
  }

  for (const userId of event.favoritedBy ?? []) {
    // Inscrit mais caché : il ne réapparaît pas en simple intéressé.
    if ((event.participants ?? []).includes(userId)) continue;
    if (friendIds.has(userId) && !seen.has(userId)) {
      seen.add(userId);
      result.push({ id: userId, kind: "interested" });
    }
  }

  return result;
}

/** Un événement porte-t-il au moins une marque ? */
export function hasHighlight(highlights: EventHighlights | undefined): boolean {
  return Boolean(highlights && (highlights.popular || highlights.lairPick || highlights.friends.length > 0));
}

/**
 * Le poids d'un événement quand il faut choisir : des amis d'abord, puis le
 * choix du lieu, puis la popularité.
 */
export function highlightScore(highlights: EventHighlights | undefined): number {
  if (!highlights) return 0;
  return (
    (highlights.friends.length > 0 ? 4 : 0) + (highlights.lairPick ? 2 : 0) + (highlights.popular ? 1 : 0)
  );
}

/**
 * Trie les événements d'une même journée : les plus marqués devant, l'heure
 * ensuite. C'est ce qui garde visibles, avant « +N autres », ceux qu'on veut
 * faire remarquer.
 */
export function compareByHighlight(a: Event, b: Event): number {
  const byScore = highlightScore(b.highlights) - highlightScore(a.highlights);
  if (byScore !== 0) return byScore;
  return a.startDateTime.localeCompare(b.startDateTime);
}

/**
 * Les événements du bloc « À ne pas manquer » parmi des candidats déjà
 * marqués : sans ceux où la personne est déjà inscrite, les plus marqués
 * d'abord, et à poids égal le plus proche.
 */
export function pickHighlights(events: Event[], viewerId: string | undefined, max = MAX_HIGHLIGHTS): Event[] {
  const seen = new Set<string>();
  return events
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      if (event.status === "cancelled") return false;
      if (viewerId && (event.participants ?? []).includes(viewerId)) return false;
      return hasHighlight(event.highlights);
    })
    .sort(compareByHighlight)
    .slice(0, max);
}
