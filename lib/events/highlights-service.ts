import "server-only";

import { getHighlightSources } from "@/lib/db/events";
import { getLairsByIds } from "@/lib/db/lairs";
import { getUserCardsByIds } from "@/lib/db/users";
import type { Event, EventHighlights } from "@/lib/types/Event";

import { friendsOn, interestCount, isLairPick, isPopular } from "./highlights";

/** Ce qu'il faut savoir de qui regarde : son compte et ses amis. */
export type HighlightViewer = { id: string; friends?: string[] } | null;

/**
 * Pose `highlights` sur chaque événement, pour la personne qui regarde.
 *
 * Trois lectures au plus, quel que soit le nombre d'événements : les champs
 * des marques (les lecteurs d'agenda ne les projettent pas tous), les
 * propriétaires des lieux dont la liste des inscrits est restreinte, et le
 * pseudo des amis rencontrés. Un visiteur ne paie que la première.
 */
export async function withHighlights<T extends Event>(events: T[], viewer: HighlightViewer): Promise<T[]> {
  if (events.length === 0) return events;

  const sources = await getHighlightSources(events.map((event) => event.id));
  const friendIds = new Set(viewer?.friends ?? []);

  // Les propriétaires d'un lieu voient toujours ses inscrits : il faut les
  // connaître dès qu'une liste n'est pas publique, et seulement alors.
  const restrictedLairIds = viewer && friendIds.size > 0
    ? [...new Set(
        [...sources.values()]
          .filter((source) => source.lairId && (source.participantsVisibility ?? "public") !== "public")
          .map((source) => source.lairId as string),
      )]
    : [];
  const owners = new Map<string, string[]>();
  if (restrictedLairIds.length > 0) {
    for (const lair of await getLairsByIds(restrictedLairIds)) {
      owners.set(lair.id, lair.owners ?? []);
    }
  }

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

    return { ...event, featured: source.featured, highlights };
  });
}
