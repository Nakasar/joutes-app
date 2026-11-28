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
import { withHighlights } from "@/lib/events/highlights-service.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { countUsersFollowingLair, getUserById } from "@/lib/db/users.ts";
import { lairNotificationPreference } from "@/lib/lairs/notification-prefs.ts";
import type { Event } from "@/lib/types/Event";
import type { Game } from "@/lib/types/Game";

/** Les quatre onglets de la vitrine d'un lieu. */
export const LAIR_TABS = ["news", "agenda", "games", "about"] as const;

export type LairTab = (typeof LAIR_TABS)[number];

/**
 * Le mois affiché par la vue calendrier : celui de l'URL s'il est valide,
 * sinon le mois en cours — la même règle que `EventsCalendarClient`.
 */
export function readAgendaMonth(
  search: { month?: string; year?: string },
  now: Date = new Date(),
): { year: number; month: number } {
  const month = Number(search.month);
  const year = Number(search.year);

  return {
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1,
    year: Number.isInteger(year) && year >= 2000 && year <= 3000 ? year : now.getFullYear(),
  };
}

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
    /** Ses amis : les marques des événements disent lesquels y vont. */
    friends: user?.friends ?? [],
    /** Les jeux suivis par le visiteur — la bascule « Mes jeux » s'en sert. */
    followedGameIds: user?.games ?? [],
    isFollowing: user?.lairs?.includes(lairId) ?? false,
    /** Ce que le visiteur reçoit du lieu, s'il le suit. */
    notificationPreference: lairNotificationPreference(user?.lairNotificationPrefs, lairId),
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
 * Combien de jours avant maintenant la lecture des événements à venir commence.
 *
 * Un événement de plusieurs jours (convention, ligue) qui a commencé reste à
 * venir tant qu'il n'est pas fini : `upcomingOf` le décide sur sa fin, en
 * mémoire. La marge couvre aussi les décalages horaires des dates stockées
 * (`+01:00`), comparées en chaînes.
 */
const ONGOING_MARGIN_DAYS = 7;

/**
 * Les événements du lieu qui ne sont pas encore finis.
 *
 * Une seule lecture pour tout ce qui parle de l'avenir — l'événement à la une,
 * la liste des prochains événements, les vignettes des jeux, les inscriptions
 * du visiteur, les vues agenda et conférence — plutôt qu'une par section.
 * Les événements passés ne sont pas lus : aucune de ces sections ne les
 * montre, et un lieu qui importe son agenda en accumule des centaines.
 * Chacun porte ses marques (choix du lieu, populaire, amis) pour la personne
 * qui regarde.
 */
export const readLairEvents = cache(async (lairId: string): Promise<Event[]> => {
  const now = DateTime.now();
  const events = await readEventsWithHighlights(lairId, {
    afterDate: now.minus({ days: ONGOING_MARGIN_DAYS }).toUTC().toISO() ?? undefined,
  });

  return events.filter((event) => endOf(event) >= now);
});

/**
 * Les événements d'un mois, pour la vue calendrier de l'onglet Agenda : la
 * grille n'en montre pas d'autres, et le calendrier relit lui-même le mois
 * suivant quand on navigue.
 */
export const readLairMonthEvents = cache(
  async (lairId: string, year: number, month: number): Promise<Event[]> =>
    readEventsWithHighlights(lairId, { year, month }),
);

async function readEventsWithHighlights(
  lairId: string,
  window: { afterDate?: string; year?: number; month?: number },
): Promise<Event[]> {
  const { session, userId, friends } = await readViewer(lairId);

  const events = await getEventsByLairId(lairId, {
    ...window,
    userId: session?.user?.id,
    gameId: "all",
  });

  return withHighlights(events, userId ? { id: userId, friends } : null);
}

function endOf(event: Event): DateTime {
  return DateTime.fromISO(event.endDateTime || event.startDateTime);
}

/** Les événements encore à venir, du plus proche au plus lointain. */
export function upcomingOf(events: Event[], now: DateTime = DateTime.now()): Event[] {
  return events
    .filter((event) => endOf(event) >= now)
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
