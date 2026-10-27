import "server-only";

import { getHighlightSources } from "@/lib/db/events";
import { getLairOwnersByIds } from "@/lib/db/lairs";
import { getUserCardsByIds } from "@/lib/db/users";
import type { Event, EventHighlights } from "@/lib/types/Event";

import { friendsOn, interestCount, isLairPick, isPopular, registeredIds, type HighlightSource } from "./highlights";

/** Ce qu'il faut savoir de qui regarde : son compte et ses amis. */
export type HighlightViewer = { id: string; friends?: string[] } | null;

/** Les champs que les marques lisent ; un événement qui les porte tous n'est pas relu. */
const SOURCE_KEYS = [
  "lairId",
  "status",
  "participants",
  "participantRegistrations",
  "favoritedBy",
  "maxParticipants",
  "waitlist",
  "featured",
  "participantsVisibility",
  "creatorId",
  "staff",
] as const satisfies readonly (keyof HighlightSource)[];

/**
 * Pose `highlights` sur chaque événement, pour la personne qui regarde.
 *
 * Trois lectures au plus, quel que soit le nombre d'événements : les champs
 * des marques (les lecteurs d'agenda ne les projettent pas tous ; un
 * événement déjà complet, comme celui de `getEventById`, n'est pas relu), les
 * propriétaires des lieux dont la liste des inscrits est restreinte, et le
 * pseudo des amis rencontrés. Un visiteur ne paie que la première.
 *
 * Au passage, les champs de remplissage (`participantRegistrations`,
 * `registeredParticipantsCount`, `staff`) sont complétés depuis ces mêmes
 * champs : selon le lecteur, une fiche les avait ou non, et affichait alors
 * « complet » ou « 0/16 » à tort.
 */
export async function withHighlights<T extends Event>(events: T[], viewer: HighlightViewer): Promise<T[]> {
  if (events.length === 0) return events;

  const sources = new Map<string, HighlightSource>();
  const missing: string[] = [];
  for (const event of events) {
    if (SOURCE_KEYS.every((key) => key in event)) sources.set(event.id, event);
    else missing.push(event.id);
  }
  for (const [id, source] of await getHighlightSources(missing)) sources.set(id, source);

  const friendIds = new Set(viewer?.friends ?? []);

  // Les propriétaires d'un lieu voient toujours ses inscrits : il faut les
  // connaître dès qu'une liste n'est pas publique, et seulement alors.
  const restrictedLairIds = viewer && friendIds.size > 0
    ? [...sources.values()]
        .filter((source) => source.lairId && (source.participantsVisibility ?? "public") !== "public")
        .map((source) => source.lairId as string)
    : [];
  const owners = await getLairOwnersByIds(restrictedLairIds);

  const friendsByEvent = new Map<string, ReturnType<typeof friendsOn>>();
  if (viewer && friendIds.size > 0) {
    for (const [id, source] of sources) {
      const found = friendsOn(source, viewer.id, friendIds, owners.get(source.lairId ?? "") ?? []);
      if (found.length > 0) friendsByEvent.set(id, found);
    }
  }

  const cards = await getUserCardsByIds([...friendsByEvent.values()].flat().map((friend) => friend.id));

  return events.map((event) => {
    const source = sources.get(event.id);
    if (!source) return event;

    const highlights: EventHighlights = {
      popular: isPopular(source),
      interest: interestCount(source),
      lairPick: isLairPick(source),
      friends: (friendsByEvent.get(event.id) ?? []).flatMap((friend) => {
        const card = cards.get(friend.id);
        return card ? [{ ...card, kind: friend.kind }] : [];
      }),
    };

    return {
      ...event,
      featured: source.featured,
      participantRegistrations: event.participantRegistrations ?? source.participantRegistrations,
      registeredParticipantsCount: event.registeredParticipantsCount ?? registeredIds(source).length,
      staff: event.staff ?? source.staff,
      highlights,
    };
  });
}
