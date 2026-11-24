import "server-only";

import { DateTime } from "luxon";
import { ObjectId } from "mongodb";

import { getUserCardsByIds } from "@/lib/db/users";
import { countDeckCommentsInSpace } from "@/lib/db/deck-comments";
import { getEventsForUser, getEventsWithUsers } from "@/lib/db/events";
import { getPlayGroupsForUser } from "@/lib/db/play-groups";
import { listPlayGroupSessions } from "@/lib/db/play-group-sessions";
import { TOURNAMENT_RESULTS_COLLECTION } from "@/lib/db/tournament-results";
import { groupSpace } from "@/lib/decks/comments";
import { withHighlights } from "@/lib/events/highlights-service";
import { loadMetaSample } from "@/lib/meta/load";
import { userCanSeeMeta } from "@/lib/meta/access";
import { legendLabel } from "@/lib/meta/stats";
import db from "@/lib/mongodb";
import type { Event } from "@/lib/types/Event";
import type { Lair } from "@/lib/types/Lair";
import type { PlayGroup } from "@/lib/types/PlayGroup";
import type { TournamentResult } from "@/lib/types/TournamentResult";
import type { User } from "@/lib/types/User";

import {
  emptyWeeklyEmailContent,
  metaTrends,
  playGroupAgenda,
  registrationOf,
  remainingAgenda,
  selectLairNews,
  selectLairPicks,
  MAX_FRIEND_EVENTS,
  WEEKLY_EMAIL_LOOKAHEAD_DAYS,
  WEEKLY_EMAIL_ZONE,
  type DigestEvent,
  type DigestFriend,
  type DigestPlayGroup,
  type WeeklyEmailContent,
  type WeeklyEmailSection,
} from "./weekly-email";

/**
 * Ce que l'email hebdomadaire raconte à un joueur, lu en base.
 *
 * Chaque section se charge à part et n'est lue que si elle est cochée ; une
 * section qui échoue est laissée vide et journalisée, sans priver le joueur du
 * reste de son email. Le choix et la mise en mots sont dans
 * `weekly-email.ts`.
 */

/** Le joueur tel que l'email le lit. */
export type WeeklyEmailReader = Pick<
  User,
  "id" | "displayName" | "lairs" | "games" | "friends" | "lairNotificationPrefs" | "location" | "notifications"
>;

const NEARBY_RADIUS_KM = 15;
const MAX_NEARBY = 3;
const MAX_WISHLIST = 5;
const MAX_RESULTS = 4;

export async function loadWeeklyEmailContent(
  reader: WeeklyEmailReader,
  sections: readonly WeeklyEmailSection[],
  nowDate: DateTime = DateTime.utc(),
): Promise<WeeklyEmailContent> {
  const now = nowDate.toUTC().toISO() as string;
  const weekStart = nowDate.setZone(WEEKLY_EMAIL_ZONE).startOf("day");
  const weekEnd = weekStart.plus({ days: 6 }).endOf("day").toUTC().toISO() as string;
  const lookahead = weekStart.plus({ days: WEEKLY_EMAIL_LOOKAHEAD_DAYS }).endOf("day").toUTC().toISO() as string;
  const since = reader.notifications?.emails?.weekly?.lastSent ?? nowDate.minus({ days: 7 }).toUTC().toISO() as string;

  const content = emptyWeeklyEmailContent(reader.displayName ?? "", weekStart.toISO() as string);
  const has = (section: WeeklyEmailSection) => sections.includes(section);
  const viewer = { id: reader.id, friends: reader.friends ?? [] };
  const followedLairs = new Set(reader.lairs ?? []);
  content.followsNothing = followedLairs.size === 0 && (reader.games ?? []).length === 0;

  // L'agenda et le choix des lieux viennent de la même lecture : les lieux et
  // jeux suivis, sur deux semaines.
  const followed = await guard("agenda", [] as Event[], async () =>
    withHighlights(
      (
        await getEventsForUser(reader.id, "followed", undefined, undefined, undefined, undefined, {
          afterDate: now,
          beforeDate: lookahead,
        })
      ).filter((event) => event.status !== "cancelled"),
      viewer,
    ),
  );

  if (has("lairPicks")) {
    content.lairPicks = selectLairPicks(followed.filter((event) => event.lairId && followedLairs.has(event.lairId))).map(
      toDigestEvent,
    );
  }

  if (has("friends") && viewer.friends.length > 0) {
    const shown = new Set(content.lairPicks.map((event) => event.id));
    content.friends = await guard("friends", [], async () => {
      const events = await withHighlights(
        await getEventsWithUsers(viewer.friends, {
          afterDate: now,
          beforeDate: lookahead,
          ...((reader.games ?? []).length > 0 ? { gameIds: reader.games } : {}),
        }),
        viewer,
      );
      return events
        .filter((event) => !shown.has(event.id) && (event.highlights?.friends.length ?? 0) > 0)
        .slice(0, MAX_FRIEND_EVENTS)
        .map(toDigestEvent);
    });
  }

  if (has("lairNews") && followedLairs.size > 0) {
    content.lairNews = await guard("lairNews", [], async () => {
      const lairs = await db
        .collection("lairs")
        .find(
          { _id: { $in: [...followedLairs].filter(ObjectId.isValid).map((id) => new ObjectId(id)) } },
          { projection: { name: 1, "options.news": 1 } },
        )
        .toArray();
      return selectLairNews(
        lairs.map((lair) => ({ id: lair._id.toString(), name: lair.name, news: lair.options?.news })),
        reader.lairNotificationPrefs,
        since,
        now,
      );
    });
  }

  if (has("registrations")) {
    content.registrations = await guard("registrations", [], () => loadRegistrations(reader.id, now, weekEnd));
  }

  // Les groupes servent à trois sections : une seule lecture.
  const needsGroups = has("playGroups") || has("wishlist") || (has("friendResults") && viewer.friends.length > 0);
  const groups = needsGroups ? await guard("groups", [] as PlayGroup[], () => getPlayGroupsForUser(reader.id)) : [];

  if (has("playGroups")) {
    content.playGroups = await guard("playGroups", [], () => loadPlayGroups(reader.id, groups, now, weekEnd));
  }

  // La méta est réservée aux abonnés Joutes Expert : l'encart aussi.
  if (has("meta") && (reader.games ?? []).length > 0 && (await guard("metaAccess", false, () => userCanSeeMeta(reader.id)))) {
    content.meta = await guard("meta", [], () => loadMeta(reader.games, now));
  }

  if (has("wishlist")) {
    content.wishlist = await guard("wishlist", [], () => loadWishlistOffers(reader.id, viewer.friends, groups));
  }

  if (has("friendResults") && viewer.friends.length > 0) {
    content.friendResults = await guard("friendResults", [], () => loadFriendResults(viewer.friends, groups, since));
  }

  if (has("nearby") && reader.location) {
    content.nearby = await guard("nearby", [], () =>
      loadNearbyLairs(reader.location as NonNullable<User["location"]>, followedLairs, reader.games ?? [], now, weekEnd),
    );
  }

  const shown = [
    ...content.lairPicks,
    ...content.friends,
    ...content.registrations.map((registration) => registration.event),
  ].map((event) => event.id);
  content.agenda = remainingAgenda(
    followed.filter((event) => Date.parse(event.startDateTime) <= Date.parse(weekEnd)),
    shown,
  ).map(toDigestEvent);

  return content;
}

async function guard<T>(section: string, fallback: T, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`Email hebdomadaire : la section « ${section} » n'a pas pu se charger :`, error);
    return fallback;
  }
}

function toDigestEvent(event: Event): DigestEvent {
  const friends: DigestFriend[] = (event.highlights?.friends ?? []).map((friend) => ({
    id: friend.id,
    displayName: friend.displayName,
    ...(friend.avatar ? { avatar: friend.avatar } : {}),
  }));
  return {
    id: event.id,
    name: event.name,
    startDateTime: event.startDateTime,
    ...(event.endDateTime ? { endDateTime: event.endDateTime } : {}),
    ...(event.game?.name || event.gameName ? { gameName: event.game?.name ?? event.gameName } : {}),
    ...(event.banner || event.game?.banner ? { banner: event.banner ?? event.game?.banner } : {}),
    ...(event.lair ? { lair: { id: event.lair.id, name: event.lair.name } } : {}),
    ...(event.registeredParticipantsCount !== undefined ? { registered: event.registeredParticipantsCount } : {}),
    ...(event.maxParticipants ? { maxParticipants: event.maxParticipants } : {}),
    ...(friends.length > 0 ? { friends } : {}),
  };
}

/** Les événements de la semaine où le joueur est inscrit ou en liste d'attente. */
async function loadRegistrations(userId: string, now: string, weekEnd: string) {
  const events = await db
    .collection<Event>("events")
    .find(
      {
        startDateTime: { $gte: now, $lte: weekEnd },
        status: { $ne: "cancelled" },
        $or: [{ participants: userId }, { "waitlist.userId": userId }],
      },
      {
        projection: {
          _id: 0, id: 1, name: 1, startDateTime: 1, endDateTime: 1, gameName: 1, lairId: 1,
          participants: 1, participantRegistrations: 1, waitlist: 1,
        },
      },
    )
    .sort({ startDateTime: 1 })
    .limit(10)
    .toArray();

  const lairNames = await readLairNames(events.flatMap((event) => (event.lairId ? [event.lairId] : [])));

  return events.flatMap((event) => {
    const registration = registrationOf(event, userId, now);
    if (!registration) return [];
    const lairName = event.lairId ? lairNames.get(event.lairId) : undefined;
    return [
      {
        ...registration,
        event: {
          id: event.id,
          name: event.name,
          startDateTime: event.startDateTime,
          ...(event.gameName ? { gameName: event.gameName } : {}),
          ...(event.lairId && lairName ? { lair: { id: event.lairId, name: lairName } } : {}),
        },
      },
    ];
  });
}

async function readLairNames(ids: string[]): Promise<Map<string, string>> {
  const valid = [...new Set(ids)].filter(ObjectId.isValid);
  if (valid.length === 0) return new Map();
  const lairs = await db
    .collection("lairs")
    .find({ _id: { $in: valid.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } })
    .toArray();
  return new Map(lairs.map((lair) => [lair._id.toString(), lair.name as string]));
}

/** Pour chaque groupe du joueur : sondages sans réponse, sessions de la semaine, commentaires non lus. */
async function loadPlayGroups(
  userId: string,
  groups: PlayGroup[],
  now: string,
  weekEnd: string,
): Promise<DigestPlayGroup[]> {

  const rows = await Promise.all(
    groups.map(async (group) => {
      const joinedAt = group.members.find((member) => member.userId === userId)?.joinedAt;
      const [sessions, comments] = await Promise.all([
        listPlayGroupSessions(group.id),
        countDeckCommentsInSpace(groupSpace(group.id), userId, joinedAt),
      ]);
      const agenda = playGroupAgenda(sessions, userId, { from: now, to: weekEnd });
      const unreadComments = [...comments.values()].reduce((sum, counts) => sum + counts.unread, 0);
      return { id: group.id, name: group.name, ...agenda, unreadComments };
    }),
  );

  return rows.filter((row) => row.polls.length > 0 || row.sessions.length > 0 || row.unreadComments > 0);
}

/** Les tendances de la méta des jeux suivis qui en ont une. */
async function loadMeta(gameIds: string[], now: string) {
  const games = await db
    .collection("games")
    .find(
      { _id: { $in: gameIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) }, "features.meta": true },
      { projection: { name: 1, slug: 1 } },
    )
    .toArray();

  const metas = await Promise.all(
    games.map(async (game) => {
      const sample = await loadMetaSample(game._id.toString(), game.slug);
      const trends = metaTrends(
        sample.decks.map((deck) => ({ legend: legendLabel(deck, sample.cards) ?? "", eventDate: deck.eventDate })),
        now,
      );
      return trends ? [{ gameName: game.name as string, ...(game.slug ? { gameSlug: game.slug as string } : {}), ...trends }] : [];
    }),
  );
  return metas.flat();
}

/**
 * Les cartes de la wishlist du joueur que vend un ami ou un de ses groupes.
 * Les listes de vente sont publiques : on ne regarde que celles de gens qu'il
 * connaît, pour que l'offre soit à portée de main.
 */
async function loadWishlistOffers(userId: string, friendIds: string[], groups: PlayGroup[]) {
  const wishlists = await db
    .collection("wishlists")
    .find({ ownerType: "user", ownerId: userId }, { projection: { _id: 1 } })
    .toArray();
  if (wishlists.length === 0) return [];

  const cardIds = await db
    .collection("wishlist-items")
    .distinct("cardId", { wishlistId: { $in: wishlists.map((wishlist) => wishlist._id) } });
  if (cardIds.length === 0) return [];

  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const sellLists = await db
    .collection("sellLists")
    .find(
      {
        $or: [
          ...(friendIds.length > 0 ? [{ ownerType: "user", ownerId: { $in: friendIds } }] : []),
          ...(groups.length > 0 ? [{ ownerType: "playGroup", ownerId: { $in: [...groupNames.keys()] } }] : []),
        ],
      },
      { projection: { _id: 1, ownerType: 1, ownerId: 1 } },
    )
    .toArray();
  if (sellLists.length === 0) return [];

  const items = await db
    .collection("sellListItems")
    .find(
      { sellListId: { $in: sellLists.map((list) => list._id) }, cardId: { $in: cardIds } },
      { projection: { sellListId: 1, name: 1, price: 1, currency: 1 } },
    )
    .sort({ createdAt: -1 })
    .limit(MAX_WISHLIST)
    .toArray();

  const owners = new Map(sellLists.map((list) => [list._id.toString(), list]));
  const friendCards = await getUserCardsByIds(
    sellLists.filter((list) => list.ownerType === "user").map((list) => list.ownerId as string),
  );

  return items.map((item) => {
    const owner = owners.get(item.sellListId.toString());
    const ownerLabel =
      owner?.ownerType === "playGroup"
        ? (groupNames.get(owner.ownerId) ?? "ton groupe")
        : (friendCards.get(owner?.ownerId)?.displayName ?? "un ami");
    return {
      cardName: item.name as string,
      sellListId: item.sellListId.toString(),
      ownerLabel,
      ...(typeof item.price === "number" ? { price: item.price } : {}),
      ...(item.currency ? { currency: item.currency as string } : {}),
    };
  });
}

/**
 * Les résultats déclarés par les amis depuis le dernier email. Un résultat
 * réservé aux groupes ne se montre que si l'ami partage un groupe avec le
 * joueur, comme sur la timeline du groupe.
 */
async function loadFriendResults(friendIds: string[], groups: PlayGroup[], since: string) {
  const groupMates = new Set(groups.flatMap((group) => group.members.map((member) => member.userId)));
  const mates = friendIds.filter((id) => groupMates.has(id));

  // Déclarés depuis le dernier email, quelle que soit la date du tournoi ; la
  // visibilité se règle dans la requête, avant la limite.
  const results = await db
    .collection<TournamentResult>(TOURNAMENT_RESULTS_COLLECTION)
    .find({
      userId: { $in: friendIds },
      provisional: { $ne: true },
      createdAt: { $gt: since },
      $or: [{ visibility: "public" }, ...(mates.length > 0 ? [{ userId: { $in: mates } }] : [])],
    })
    .sort({ createdAt: -1 })
    .limit(MAX_RESULTS)
    .toArray();
  const cards = await getUserCardsByIds(results.map((result) => result.userId));

  return results.map((result) => ({
    id: result.id,
    friendName: cards.get(result.userId)?.displayName ?? "Un ami",
    name: result.name,
    date: result.date,
    ...(result.placement ? { placement: result.placement } : {}),
    ...(result.playerCount ? { playerCount: result.playerCount } : {}),
    ...(result.record ? { record: result.record } : {}),
    ...(result.legendName ? { legendName: result.legendName } : {}),
  }));
}

/** Les lieux publics proches, non suivis, qui jouent cette semaine aux jeux du joueur. */
async function loadNearbyLairs(
  location: NonNullable<User["location"]>,
  followed: Set<string>,
  gameIds: string[],
  now: string,
  weekEnd: string,
) {
  const lairs = await db
    .collection<Lair & { _id: ObjectId }>("lairs")
    .find(
      {
        isPrivate: { $ne: true },
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [location.longitude, location.latitude] },
            $maxDistance: NEARBY_RADIUS_KM * 1000,
          },
        },
      },
      { projection: { name: 1, location: 1 } },
    )
    .limit(30)
    .toArray();

  const candidates = lairs.filter((lair) => !followed.has(lair._id.toString()));
  if (candidates.length === 0) return [];

  const gameNames =
    gameIds.length > 0
      ? await db
          .collection("games")
          .distinct("name", { _id: { $in: gameIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) } })
      : [];

  const counts = await db
    .collection("events")
    .aggregate<{ _id: string; events: number }>([
      {
        $match: {
          lairId: { $in: candidates.map((lair) => lair._id.toString()) },
          startDateTime: { $gte: now, $lte: weekEnd },
          status: { $ne: "cancelled" },
          ...(gameNames.length > 0 ? { gameName: { $in: gameNames } } : {}),
        },
      },
      { $group: { _id: "$lairId", events: { $sum: 1 } } },
    ])
    .toArray();
  const byLair = new Map(counts.map((row) => [row._id, row.events]));

  return candidates
    .filter((lair) => byLair.has(lair._id.toString()))
    .slice(0, MAX_NEARBY)
    .map((lair) => ({
      id: lair._id.toString(),
      name: lair.name,
      distanceKm: Math.round(distanceKm(location, lair.location?.coordinates)),
      events: byLair.get(lair._id.toString()) ?? 0,
    }));
}

/** Distance à vol d'oiseau, en kilomètres. */
function distanceKm(from: { latitude: number; longitude: number }, to: number[] | undefined): number {
  if (!to || to.length < 2) return 0;
  const [longitude, latitude] = to;
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(latitude - from.latitude);
  const dLon = rad(longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.latitude)) * Math.cos(rad(latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
