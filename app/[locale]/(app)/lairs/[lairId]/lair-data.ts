import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DateTime } from "luxon";

import { auth } from "@/lib/auth.ts";
import { checkAdminOrOwner } from "@/lib/middleware/admin.ts";
import { getLairById } from "@/lib/db/lairs.ts";
import { getEventsByLairId } from "@/lib/db/events.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { countUsersFollowingLair, getUserById } from "@/lib/db/users.ts";
import type { Event } from "@/lib/types/Event";
import type { Game } from "@/lib/types/Game";

/** Les quatre onglets de la vitrine d'un lieu. */
export const LAIR_TABS = ["news", "agenda", "games", "about"] as const;

export type LairTab = (typeof LAIR_TABS)[number];

/** L'onglet demandé par l'URL, ramené aux quatre connus. */
export function readLairTab(value: string | undefined): LairTab {
  return LAIR_TABS.includes(value as LairTab) ? (value as LairTab) : "news";
}

/**
 * Le lieu, lu une fois par rendu — et la porte de confidentialité avec lui.
 *
 * Un lieu privé ne s'ouvre qu'à ceux qui le suivent et à son équipe. La
 * confidentialité se lit sur le lieu, et **la session n'est interrogée que si
 * le lieu est privé** : un lieu public s'affiche dès sa lecture ; un lieu privé
 * attend sa porte, et n'a alors rien montré — pas même son nom.
 *
 * `cache` de React mémoïse le tout : toutes les sections le demandent.
 */
export const requireVisibleLair = cache(async (lairId: string) => {
  // Le pilote Mongo touche à l'horloge en lisant le lieu, ce qu'un prérendu ne
  // sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const lair = await getLairById(lairId);
  if (!lair) {
    notFound();
  }

  if (!lair.isPrivate) {
    return lair;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user?.id ? await getUserById(session.user.id) : null;
  const isFollowing = user?.lairs?.includes(lairId) ?? false;
  const canManageLair = await checkAdminOrOwner(lairId);

  if (!isFollowing && !canManageLair) {
    notFound();
  }

  return lair;
});

/** La session et les droits sur ce lieu, une fois par rendu. */
export const readViewer = cache(async (lairId: string) => {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user?.id ? await getUserById(session.user.id) : null;

  return {
    session,
    userId: user?.id ?? null,
    /** Les jeux suivis par le visiteur — la bascule « Mes jeux » s'en sert. */
    followedGameIds: user?.games ?? [],
    isFollowing: user?.lairs?.includes(lairId) ?? false,
    hasGames: Boolean(user?.games && user.games.length > 0),
    canManageLair: await checkAdminOrOwner(lairId),
  };
});

/** Le nombre de joueurs qui suivent le lieu, pour la colonne de droite. */
export const readFollowersCount = cache(async (lairId: string) =>
  countUsersFollowingLair(lairId),
);

/** Les jeux proposés par le lieu, dans l'ordre déclaré, les inconnus retirés. */
export const readLairGames = cache(async (lairId: string): Promise<Game[]> => {
  const lair = await requireVisibleLair(lairId);
  const games = await Promise.all(lair.games.map((gameId) => readGameBySlugOrId(gameId)));

  return games.filter((game): game is Game => game !== null);
});

/**
 * Les événements du lieu sur l'année en cours.
 *
 * Une seule lecture pour trois usages — l'événement à la une, la liste des
 * prochains événements et le calendrier — plutôt qu'une par section : le
 * cadrage au mois se fait ensuite, en mémoire.
 */
export const readLairEvents = cache(async (lairId: string): Promise<Event[]> => {
  const { session } = await readViewer(lairId);

  return getEventsByLairId(lairId, {
    year: new Date().getFullYear(),
    userId: session?.user?.id,
    gameId: "all",
  });
});

/** Les événements encore à venir, du plus proche au plus lointain. */
export function upcomingOf(events: Event[], now: DateTime = DateTime.now()): Event[] {
  return events
    .filter((event) => DateTime.fromISO(event.endDateTime || event.startDateTime) >= now)
    .filter((event) => event.status !== "cancelled")
    .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
}

/**
 * Combien d'événements à venir portent chaque jeu — le chiffre des vignettes.
 *
 * Indexé par nom de jeu : c'est `gameName` qui relie un événement à son jeu
 * dans la base, l'identifiant n'étant pas porté par l'événement.
 */
export function countUpcomingByGame(events: Event[]): Record<string, number> {
  return upcomingOf(events).reduce<Record<string, number>>((counts, event) => {
    counts[event.gameName] = (counts[event.gameName] ?? 0) + 1;
    return counts;
  }, {});
}
