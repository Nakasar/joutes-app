import { DateTime } from "luxon";

import {
  acceptsLairNotification,
  lairNotificationPreference,
  type StoredLairNotificationPref,
} from "@/lib/lairs/notification-prefs";
import type { LairNewsItem } from "@/lib/types/Lair";
import type { PlayGroupSession } from "@/lib/types/PlayGroupSession";
import type { User } from "@/lib/types/User";

/**
 * L'email hebdomadaire : ses sections, leurs réglages, et ce qu'il dit.
 *
 * Le contenu se charge dans `weekly-email-service.ts` ; ce module choisit,
 * trie et met en mots. Module pur, sans accès à la base : c'est ce qui le rend
 * testable (`weekly-email.test.ts`).
 */

/**
 * Les sections que le joueur peut cocher, dans l'ordre où l'email les montre.
 * L'agenda de la semaine n'en fait pas partie : c'est le cœur de l'email, il
 * est toujours là.
 */
export const WEEKLY_EMAIL_SECTIONS = [
  "lairPicks",
  "friends",
  "lairNews",
  "registrations",
  "playGroups",
  "meta",
  "wishlist",
  "friendResults",
  "nearby",
] as const;

export type WeeklyEmailSection = (typeof WEEKLY_EMAIL_SECTIONS)[number];

export type WeeklyEmailSettings = {
  sections: WeeklyEmailSection[];
  /** Une semaine sans rien à dire n'envoie pas d'email. */
  skipEmpty: boolean;
};

/** Le fuseau dans lequel les dates de l'email sont écrites. */
export const WEEKLY_EMAIL_ZONE = "Europe/Paris";

/** Combien de jours devant soi regardent le choix des lieux et les amis. */
export const WEEKLY_EMAIL_LOOKAHEAD_DAYS = 14;

/** Au plus 3 choix par lieu (le plafond de la mise en avant), 4 en tout. */
export const MAX_PICKS_PER_LAIR = 3;
export const MAX_PICKS = 4;
export const MAX_FRIEND_EVENTS = 4;
export const MAX_LAIR_NEWS = 4;
export const MAX_AGENDA = 10;

export function isWeeklyEmailSection(value: unknown): value is WeeklyEmailSection {
  return typeof value === "string" && (WEEKLY_EMAIL_SECTIONS as readonly string[]).includes(value);
}

/**
 * Valide une liste de sections venue d'un formulaire ou d'une requête.
 *
 * Une section inconnue est écartée plutôt que refusée (une app plus récente
 * que le serveur ne doit pas voir tout son réglage rejeté) ; le résultat suit
 * l'ordre de référence, sans doublon. `null` si ce n'est pas une liste.
 */
export function parseWeeklyEmailSections(input: unknown): WeeklyEmailSection[] | null {
  if (!Array.isArray(input)) return null;
  return WEEKLY_EMAIL_SECTIONS.filter((section) => input.includes(section));
}

type StoredWeekly = NonNullable<NonNullable<User["notifications"]>["emails"]>["weekly"];

/**
 * Les réglages tels que le compte les porte. Sans choix enregistré, toutes les
 * sections sont cochées ; sans réglage d'envoi, une semaine vide n'envoie rien.
 */
export function readWeeklyEmailSettings(weekly: StoredWeekly | undefined): WeeklyEmailSettings {
  const sections = parseWeeklyEmailSections(weekly?.sections) ?? [...WEEKLY_EMAIL_SECTIONS];
  return { sections, skipEmpty: weekly?.skipEmpty !== false };
}

// ---------------------------------------------------------------------------
// Le contenu

export type DigestFriend = { id: string; displayName: string; avatar?: string };

export type DigestEvent = {
  id: string;
  name: string;
  startDateTime: string;
  endDateTime?: string;
  gameName?: string;
  banner?: string;
  lair?: { id: string; name: string };
  registered?: number;
  maxParticipants?: number;
  friends?: DigestFriend[];
};

export type DigestLairNews = {
  id: string;
  lairId: string;
  lairName: string;
  title: string;
  summary?: string;
  category?: string;
  publishedAt: string;
};

export type DigestRegistration = {
  event: DigestEvent;
  status: "registered" | "pre-registered" | "waitlist" | "offer";
  /** Rang dans la liste d'attente, à partir de 1. */
  position?: number;
  offerExpiresAt?: string;
};

export type DigestPlayGroup = {
  id: string;
  name: string;
  /** Sondages ouverts où le joueur n'a voté pour aucun créneau. */
  polls: { id: string; title: string; respondents: number; closesAt?: string }[];
  /** Sessions confirmées de la semaine. */
  sessions: { id: string; title: string; startsAt: string; place?: string }[];
  unreadComments: number;
};

export type DigestMetaLegend = { name: string; share: number; trend: "up" | "down" | "stable" | "new" };

export type DigestMeta = { gameName: string; gameSlug?: string; decks: number; legends: DigestMetaLegend[] };

export type DigestWishlistOffer = {
  cardName: string;
  sellListId: string;
  ownerLabel: string;
  price?: number;
  currency?: string;
};

export type DigestFriendResult = {
  id: string;
  friendName: string;
  name: string;
  date: string;
  placement?: number;
  playerCount?: number;
  record?: { wins: number; losses: number; draws: number };
  legendName?: string;
};

export type DigestNearbyLair = { id: string; name: string; distanceKm: number; events: number };

export type WeeklyEmailContent = {
  username: string;
  /** Le lundi de la semaine racontée, ISO. */
  weekStart: string;
  lairPicks: DigestEvent[];
  friends: DigestEvent[];
  lairNews: DigestLairNews[];
  registrations: DigestRegistration[];
  playGroups: DigestPlayGroup[];
  meta: DigestMeta[];
  wishlist: DigestWishlistOffer[];
  friendResults: DigestFriendResult[];
  nearby: DigestNearbyLair[];
  /** Le reste de la semaine dans les lieux suivis. */
  agenda: DigestEvent[];
  /** Le joueur ne suit ni jeu ni lieu : l'email l'invite à commencer. */
  followsNothing: boolean;
};

export function emptyWeeklyEmailContent(username: string, weekStart: string): WeeklyEmailContent {
  return {
    username,
    weekStart,
    lairPicks: [],
    friends: [],
    lairNews: [],
    registrations: [],
    playGroups: [],
    meta: [],
    wishlist: [],
    friendResults: [],
    nearby: [],
    agenda: [],
    followsNothing: false,
  };
}

/** Rien à raconter cette semaine, l'invitation à suivre des lieux mise à part. */
export function isWeeklyEmailEmpty(content: WeeklyEmailContent): boolean {
  return (
    content.lairPicks.length === 0 &&
    content.friends.length === 0 &&
    content.lairNews.length === 0 &&
    content.registrations.length === 0 &&
    content.playGroups.length === 0 &&
    content.meta.length === 0 &&
    content.wishlist.length === 0 &&
    content.friendResults.length === 0 &&
    content.nearby.length === 0 &&
    content.agenda.length === 0
  );
}

// ---------------------------------------------------------------------------
// Les choix

/**
 * Le choix des lieux : les événements mis en avant, du plus proche au plus
 * lointain, au plus `MAX_PICKS_PER_LAIR` par lieu et `MAX_PICKS` en tout.
 */
export function selectLairPicks<T extends { featured?: boolean; lairId?: string; startDateTime: string }>(
  events: T[],
): T[] {
  const perLair = new Map<string, number>();
  const picks: T[] = [];
  for (const event of [...events].sort((a, b) => a.startDateTime.localeCompare(b.startDateTime))) {
    if (!event.featured || !event.lairId) continue;
    const count = perLair.get(event.lairId) ?? 0;
    if (count >= MAX_PICKS_PER_LAIR) continue;
    perLair.set(event.lairId, count + 1);
    picks.push(event);
    if (picks.length >= MAX_PICKS) break;
  }
  return picks;
}

/**
 * Les annonces des lieux suivis publiées depuis `since`, les plus récentes
 * d'abord. Un lieu dont le joueur a coupé les annonces (`none`, ou `custom`
 * sans « announcements ») n'en donne aucune.
 */
export function selectLairNews(
  lairs: { id: string; name: string; news?: LairNewsItem[] }[],
  prefs: readonly StoredLairNotificationPref[] | undefined,
  since: string,
  now: string,
): DigestLairNews[] {
  const news: DigestLairNews[] = [];
  for (const lair of lairs) {
    if (!acceptsLairNotification(lairNotificationPreference(prefs, lair.id), "announcements")) continue;
    for (const item of lair.news ?? []) {
      if (!item.publishedAt || item.publishedAt <= since || item.publishedAt > now) continue;
      news.push({
        id: item.id,
        lairId: lair.id,
        lairName: lair.name,
        title: item.title,
        ...(item.summary ? { summary: item.summary } : {}),
        ...(item.category ? { category: item.category } : {}),
        publishedAt: item.publishedAt,
      });
    }
  }
  return news.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_LAIR_NEWS);
}

/**
 * Où en est le joueur pour un événement : inscrit, pré-inscrit, en liste
 * d'attente (avec son rang) ou une place offerte. `null` s'il n'y est pas, ou
 * en a été exclu.
 */
export function registrationOf(
  event: {
    participants?: string[];
    participantRegistrations?: Record<string, string>;
    waitlist?: { userId: string; joinedAt: string; offeredAt?: string; offerExpiresAt?: string }[];
  },
  userId: string,
  now: string,
): Omit<DigestRegistration, "event"> | null {
  if (event.participants?.includes(userId)) {
    const status = event.participantRegistrations?.[userId] ?? "REGISTERED";
    if (status === "REGISTERED") return { status: "registered" };
    if (status === "PRE_REGISTERED") return { status: "pre-registered" };
    return null;
  }

  const waitlist = [...(event.waitlist ?? [])].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const index = waitlist.findIndex((entry) => entry.userId === userId);
  if (index < 0) return null;

  const entry = waitlist[index];
  if (entry.offeredAt && entry.offerExpiresAt && entry.offerExpiresAt > now) {
    return { status: "offer", offerExpiresAt: entry.offerExpiresAt };
  }
  return { status: "waitlist", position: index + 1 };
}

/**
 * Ce qui attend le joueur dans un groupe : les sondages ouverts où il n'a voté
 * pour aucun créneau, et les sessions confirmées de la semaine.
 */
export function playGroupAgenda(
  sessions: PlayGroupSession[],
  userId: string,
  { from, to }: { from: string; to: string },
): Pick<DigestPlayGroup, "polls" | "sessions"> {
  const polls = sessions
    .filter((session) => session.status === "poll")
    .filter((session) => !session.pollClosesAt || session.pollClosesAt >= from)
    .filter((session) => !(session.slots ?? []).some((slot) => slot.voterIds.includes(userId)))
    .map((session) => ({
      id: session.id,
      title: session.title,
      respondents: new Set((session.slots ?? []).flatMap((slot) => slot.voterIds)).size,
      ...(session.pollClosesAt ? { closesAt: session.pollClosesAt } : {}),
    }));

  const confirmed = sessions
    .filter((session) => session.status === "confirmed" && session.startsAt)
    .filter((session) => (session.startsAt as string) >= from && (session.startsAt as string) <= to)
    .sort((a, b) => (a.startsAt as string).localeCompare(b.startsAt as string))
    .map((session) => ({
      id: session.id,
      title: session.title,
      startsAt: session.startsAt as string,
      ...(session.place?.label ? { place: session.place.label } : {}),
    }));

  return { polls, sessions: confirmed };
}

/** Les deux fenêtres comparées par la méta : les 14 derniers jours, et les 28 d'avant. */
export const META_RECENT_DAYS = 14;
export const META_PREVIOUS_DAYS = 28;
/** En dessous, la période ne dit rien. */
export const META_MIN_RECENT_DECKS = 8;
export const META_MIN_PREVIOUS_DECKS = 5;
/** Un écart de part de moins de 3 points est « stable ». */
export const META_TREND_THRESHOLD = 0.03;

/**
 * Les trois légendes les plus jouées des 14 derniers jours, et leur tendance
 * face aux 28 jours d'avant. `null` quand l'échantillon récent est trop maigre.
 */
export function metaTrends(
  decks: { legend: string; eventDate: string }[],
  now: string,
): { decks: number; legends: DigestMetaLegend[] } | null {
  const end = DateTime.fromISO(now);
  const recentStart = end.minus({ days: META_RECENT_DAYS }).toISO() as string;
  const previousStart = end.minus({ days: META_RECENT_DAYS + META_PREVIOUS_DAYS }).toISO() as string;

  const recent = decks.filter((deck) => deck.legend && deck.eventDate >= recentStart && deck.eventDate <= now);
  const previous = decks.filter((deck) => deck.legend && deck.eventDate >= previousStart && deck.eventDate < recentStart);
  if (recent.length < META_MIN_RECENT_DECKS) return null;

  const shares = (sample: typeof decks) => {
    const counts = new Map<string, number>();
    for (const deck of sample) counts.set(deck.legend, (counts.get(deck.legend) ?? 0) + 1);
    return new Map([...counts].map(([legend, count]) => [legend, count / sample.length]));
  };
  const recentShares = shares(recent);
  const previousShares = previous.length >= META_MIN_PREVIOUS_DECKS ? shares(previous) : null;

  const legends = [...recentShares]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([name, share]): DigestMetaLegend => {
      if (!previousShares) return { name, share, trend: "stable" };
      const before = previousShares.get(name);
      if (before === undefined) return { name, share, trend: "new" };
      const delta = share - before;
      return {
        name,
        share,
        trend: delta >= META_TREND_THRESHOLD ? "up" : delta <= -META_TREND_THRESHOLD ? "down" : "stable",
      };
    });

  return { decks: recent.length, legends };
}

/** L'agenda sans ce que les sections du dessus montrent déjà. */
export function remainingAgenda<T extends { id: string; startDateTime: string }>(events: T[], shown: Iterable<string>): T[] {
  const skip = new Set(shown);
  return events
    .filter((event) => !skip.has(event.id))
    .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime))
    .slice(0, MAX_AGENDA);
}

// ---------------------------------------------------------------------------
// Les mots

function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

function joinFr(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

/** « Léa », « Léa et Théo », « Léa, Théo et 2 autres ». */
export function friendNames(friends: { displayName: string }[]): string {
  const names = friends.map((friend) => friend.displayName);
  if (names.length <= 2) return joinFr(names);
  return `${names.slice(0, 2).join(", ")} et ${plural(names.length - 2, "autre", "autres")}`;
}

/** La phrase d'ouverture : ce que contient l'email, en une ligne. */
export function weeklyEmailIntro(content: WeeklyEmailContent): string {
  const parts: string[] = [];
  if (content.lairPicks.length) parts.push(plural(content.lairPicks.length, "choix de tes lieux", "choix de tes lieux"));
  if (content.friends.length) {
    parts.push(plural(content.friends.length, "sortie repérée par tes amis", "sorties repérées par tes amis"));
  }
  if (content.lairNews.length) parts.push(plural(content.lairNews.length, "annonce", "annonces"));
  if (content.agenda.length) {
    const other = parts.length > 0;
    parts.push(
      plural(
        content.agenda.length,
        other ? "autre évènement" : "évènement",
        other ? "autres évènements" : "évènements",
      ),
    );
  }
  if (parts.length === 0) return "Voici ce qui se passe autour de toi cette semaine.";
  return `Cette semaine : ${joinFr(parts)}.`;
}

/** « samedi » dans la semaine qui vient, « samedi 5 décembre » au-delà. */
function whenLabel(iso: string, now: string): string {
  const date = DateTime.fromISO(iso).setZone(WEEKLY_EMAIL_ZONE).setLocale("fr");
  const days = date.startOf("day").diff(DateTime.fromISO(now).setZone(WEEKLY_EMAIL_ZONE).startOf("day"), "days").days;
  return days < 7 ? date.toFormat("cccc") : date.toFormat("cccc d LLLL");
}

/**
 * L'objet de l'email : le premier choix des lieux, sinon la première sortie
 * repérée par les amis, sinon la semaine.
 */
export function weeklyEmailSubject(content: WeeklyEmailContent, now: string): string {
  const pick = content.lairPicks[0];
  if (pick) return `${pick.name} ${whenLabel(pick.startDateTime, now)}, et ta semaine Joutes`;

  const friendsEvent = content.friends.find((event) => (event.friends ?? []).length > 0);
  if (friendsEvent) {
    return `${friendNames(friendsEvent.friends ?? [])} : ${friendsEvent.name}, et ta semaine Joutes`;
  }

  const start = DateTime.fromISO(content.weekStart).setZone(WEEKLY_EMAIL_ZONE).setLocale("fr");
  const end = start.plus({ days: 6 });
  const range =
    start.month === end.month
      ? `du ${start.toFormat("d")} au ${end.toFormat("d LLLL")}`
      : `du ${start.toFormat("d LLLL")} au ${end.toFormat("d LLLL")}`;
  return `Ta semaine Joutes ${range}`;
}
