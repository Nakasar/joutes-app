import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/lib/auth.ts";
import { getAchievementsForUser } from "@/lib/db/achievements.ts";
import { searchDecks } from "@/lib/db/decks.ts";
import { areUsersFriends, getPendingRequestBetween } from "@/lib/db/friends.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getLairsByIds } from "@/lib/db/lairs.ts";
import { getPlayGroupsForUser } from "@/lib/db/play-groups.ts";
import { getSellListForOwner, getSellListItems } from "@/lib/db/sell-lists.ts";
import { getStreamLinksForUser } from "@/lib/db/stream-links.ts";
import { getBadgesForUser } from "@/lib/db/user-badges.ts";
import { listPublicContentsByAuthor } from "@/lib/db/user-contents.ts";
import { countUserFollowers, isFollowingUser } from "@/lib/db/user-followers.ts";
import { getUserByTagOrId, getUserById } from "@/lib/db/users.ts";
import { getPublicWishlistsForOwner, getWishlistItems } from "@/lib/db/wishlists.ts";
import { matchWishesToOffers, type TradeMatch } from "@/lib/play-groups/trade-matches.ts";
import { plansForUserId } from "@/lib/subscriptions/access.ts";
import { displayPlan, grantsEntitlement } from "@/lib/subscriptions/entitlements.ts";
import type { Deck } from "@/lib/types/Deck";
import type { Game } from "@/lib/types/Game";
import type { Lair } from "@/lib/types/Lair";
import type { PlayGroup } from "@/lib/types/PlayGroup";
import type { StreamLinkLive } from "@/lib/types/StreamLink";
import type { User } from "@/lib/types/User";
import { parseProfileHandle, toLookupKey } from "@/lib/users/handle.ts";
import { readUserLinks } from "@/lib/users/links.ts";
import { readUserShowcaseSections } from "@/lib/users/showcase.ts";

/**
 * Ce que la vitrine d'un profil lit, une fois par rendu.
 *
 * Chaque bloc réclame ce dont il a besoin, et `cache` de React fait que la
 * page ne le paie qu'une fois — c'est la mécanique de `lair-data.ts`, et elle
 * vaut d'autant plus ici que le profil et ses métadonnées lisent le même compte
 * dans deux exécutions distinctes.
 *
 * **La porte de confidentialité n'est pas une porte d'accès.** Un profil privé
 * se résout et s'affiche : son pseudonyme, ses badges, son ancienneté, sa liste
 * de vente et ses listes de souhaits publiques restent visibles, parce que ce
 * sont des choix qu'il a faits ailleurs, liste par liste. Ce que `isPublic`
 * conditionne, c'est le contenu de la vitrine — jeux, lieux, succès, decks,
 * publications, groupes.
 */

/** Ce que la vitrine montre du compte affiché. */
export type ProfileSubject = {
  user: User;
  isPublic: boolean;
  /** `Pseudo#1234`, ou le nom de compte à défaut. */
  tag: string;
  /** Le pseudonyme seul, pour l'afficher plus gros que son discriminateur. */
  displayName: string;
  discriminator?: string;
  avatar?: string;
};

/**
 * Le compte affiché.
 *
 * `notFound()` seulement s'il n'existe pas : un profil privé se rend, il ne
 * disparaît pas. Faire l'inverse casserait la modération — un profil qu'on ne
 * peut plus atteindre est un profil qu'on ne peut plus signaler.
 */
export const requireProfile = cache(async (userTagOrId: string): Promise<ProfileSubject> => {
  // Le pilote Mongo touche à l'horloge en lisant le compte, ce qu'un prérendu
  // ne sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const handle = parseProfileHandle(decodeURIComponent(userTagOrId));
  const key = toLookupKey(handle);

  if (!key) {
    notFound();
  }

  const user = await getUserByTagOrId(key);

  if (!user) {
    notFound();
  }

  return {
    user,
    isPublic: user.isPublicProfile === true,
    tag:
      user.displayName && user.discriminator
        ? `${user.displayName}#${user.discriminator}`
        : user.username,
    displayName: user.displayName || user.username,
    discriminator: user.discriminator,
    avatar: user.profileImage || user.avatar || undefined,
  };
});

/** Qui regarde, et ce qu'il peut faire ici. */
export const readProfileViewer = cache(async (userTagOrId: string) => {
  const [{ user }, session] = await Promise.all([
    requireProfile(userTagOrId),
    auth.api.getSession({ headers: await headers() }),
  ]);

  const viewerId = session?.user?.id ?? null;
  const isOwner = viewerId === user.id;

  if (!viewerId || isOwner) {
    return {
      viewerId,
      isOwner,
      isAuthenticated: Boolean(viewerId),
      isFollowing: false,
      isFriend: false,
      hasPendingFriendRequest: false,
    };
  }

  const [isFollowing, isFriend, pendingRequest] = await Promise.all([
    isFollowingUser(user.id, viewerId),
    areUsersFriends(viewerId, user.id),
    getPendingRequestBetween(viewerId, user.id),
  ]);

  return {
    viewerId,
    isOwner,
    isAuthenticated: true,
    isFollowing,
    isFriend,
    hasPendingFriendRequest: pendingRequest !== null,
  };
});

/** Le palier affiché et les statuts posés par l'équipe. */
export const readProfileBadges = cache(async (userTagOrId: string) => {
  const { user } = await requireProfile(userTagOrId);
  return getBadgesForUser(user.id);
});

/**
 * Le palier du compte affiché — et non celui du visiteur.
 *
 * Distinct des badges parce qu'il sert à autre chose : le droit à la bannière.
 * `getBadgesForUser` écarte délibérément le forçage de développement, ce qui est
 * juste pour un badge et faux pour un droit.
 */
export const readProfilePlans = cache(async (userTagOrId: string) => {
  const { user } = await requireProfile(userTagOrId);
  const plans = await plansForUserId(user.id);

  return {
    plans,
    displayed: displayPlan(plans),
    canUseBanner: grantsEntitlement(plans, "sub:profile-banner"),
  };
});

/** L'ordre et l'activation des blocs, tels que le compte les a réglés. */
export const readProfileSections = cache(async (userTagOrId: string) => {
  const { user } = await requireProfile(userTagOrId);
  return readUserShowcaseSections(user);
});

/** Les liens du profil, nettoyés et dédoublonnés. */
export const readProfileLinks = cache(async (userTagOrId: string) => {
  const { user } = await requireProfile(userTagOrId);
  return readUserLinks(user);
});

export const readFollowersCount = cache(async (userTagOrId: string) => {
  const { user } = await requireProfile(userTagOrId);
  return countUserFollowers(user.id);
});

/**
 * Les jeux suivis, dans l'ordre déclaré, les inconnus retirés.
 *
 * Une lecture par jeu plutôt que le catalogue entier : `readGameBySlugOrId` est
 * mis en cache par le dépôt, et charger tous les jeux pour en résoudre trois
 * était le défaut de la page précédente.
 */
export const readProfileGames = cache(async (userTagOrId: string): Promise<Game[]> => {
  const { user, isPublic } = await requireProfile(userTagOrId);

  if (!isPublic || !user.games?.length) {
    return [];
  }

  const games = await Promise.all(user.games.map((gameId) => readGameBySlugOrId(gameId)));
  return games.filter((game): game is Game => game !== null);
});

export const readProfileLairs = cache(async (userTagOrId: string): Promise<Lair[]> => {
  const { user, isPublic } = await requireProfile(userTagOrId);

  if (!isPublic || !user.lairs?.length) {
    return [];
  }

  return getLairsByIds(user.lairs);
});

/** Les groupes de jeu publics dont le compte est membre. */
export const readProfileGroups = cache(async (userTagOrId: string): Promise<PlayGroup[]> => {
  const { user, isPublic } = await requireProfile(userTagOrId);

  if (!isPublic) {
    return [];
  }

  // Ses groupes, filtrés aux publics : `listPlayGroups` répondrait « les
  // groupes visibles par le visiteur », qui n'est pas la question posée.
  const groups = await getPlayGroupsForUser(user.id);
  return groups.filter((group) => group.visibility === "public").slice(0, 6);
});

/**
 * Le catalogue des succès et ceux que ce compte a décrochés.
 *
 * `unlocked` sort du plus récent au plus ancien : la vitrine n'en montre que
 * les premiers, et « les trois derniers » est la seule sélection qui veuille
 * dire quelque chose — l'ordre du catalogue, lui, n'en dit aucune.
 */
export const readProfileAchievements = cache(async (userTagOrId: string) => {
  const { user } = await requireProfile(userTagOrId);
  const achievements = await getAchievementsForUser(user.id);
  // `new Date` plutôt que `.getTime()` directement : la date vient de Mongo, et
  // un document importé par script peut la porter en chaîne — un tri qui plante
  // emporterait la page entière.
  const unlockedTime = (achievement: { unlockedAt?: Date }) =>
    achievement.unlockedAt ? new Date(achievement.unlockedAt).getTime() : 0;

  const unlocked = achievements
    .filter((achievement) => achievement.unlockedAt)
    .sort((a, b) => unlockedTime(b) - unlockedTime(a));

  return {
    all: achievements,
    unlocked,
    total: achievements.length,
    points: unlocked.reduce((sum, achievement) => sum + achievement.points, 0),
  };
});

/** Les decks publics, le deck épinglé en tête. */
export const readProfileDecks = cache(async (userTagOrId: string): Promise<Deck[]> => {
  const { user, isPublic } = await requireProfile(userTagOrId);

  if (!isPublic) {
    return [];
  }

  const { decks } = await searchDecks({
    playerId: user.id,
    visibility: "public",
    sortBy: "updatedAt",
    sortOrder: "desc",
    limit: 6,
  });

  const pinnedId = user.showcase?.pinnedDeckId;
  if (!pinnedId) {
    return decks;
  }

  const pinned = decks.find((deck) => deck.id === pinnedId);
  return pinned ? [pinned, ...decks.filter((deck) => deck.id !== pinnedId)] : decks;
});

export const readProfileContents = cache(async (userTagOrId: string) => {
  const { user, isPublic } = await requireProfile(userTagOrId);

  if (!isPublic) {
    return [];
  }

  return listPublicContentsByAuthor(user.id);
});

/**
 * Le direct en cours, s'il est annoncé sur ce profil.
 *
 * La destination compte : une chaîne liée qui n'annonce que sur un lieu ne doit
 * pas allumer la vitrine de son titulaire. La liste des destinations *est* le
 * réglage, ici comme partout ailleurs.
 */
export const readProfileLive = cache(
  async (userTagOrId: string): Promise<StreamLinkLive | null> => {
    const { user, isPublic } = await requireProfile(userTagOrId);

    if (!isPublic) {
      return null;
    }

    const links = await getStreamLinksForUser(user.id);
    const live = links.find(
      (link) =>
        link.live && link.targets.some((target) => target.kind === "user" && target.id === user.id),
    );

    return live?.live ?? null;
  },
);

/** Les listes de souhaits publiques et la liste de vente. */
export const readProfileLists = cache(async (userTagOrId: string) => {
  const { user } = await requireProfile(userTagOrId);
  const owner = { type: "user" as const, id: user.id };

  const [wishlists, sellList] = await Promise.all([
    getPublicWishlistsForOwner(owner),
    getSellListForOwner(owner),
  ]);

  return { wishlists, sellList };
});

/** Ce qu'on lit de chaque liste pour le rapprochement — assez pour nommer une carte, pas plus. */
const TRADE_SCAN_LIMIT = 200;

/**
 * Ce que le visiteur pourrait céder à ce joueur.
 *
 * Le rapprochement se fait en mémoire sur un échantillon borné, comme pour les
 * groupes de jeu : une jointure en base sur les identifiants de cartes coûterait
 * plus cher que de comparer deux cents lignes, et l'encart n'en montre de toute
 * façon qu'une poignée.
 *
 * `matchWishesToOffers` attend un auteur par ligne pour ne pas rapprocher
 * quelqu'un de lui-même. Les listes personnelles n'en portent pas — leur
 * propriétaire *est* l'auteur — on le synthétise donc depuis le propriétaire de
 * chaque liste.
 */
export const readProfileTradeMatches = cache(
  async (userTagOrId: string): Promise<TradeMatch[]> => {
    const [{ user }, viewer] = await Promise.all([
      requireProfile(userTagOrId),
      readProfileViewer(userTagOrId),
    ]);

    if (!viewer.viewerId || viewer.isOwner) {
      return [];
    }

    const [wishlists, mySellList] = await Promise.all([
      getPublicWishlistsForOwner({ type: "user", id: user.id }),
      getSellListForOwner({ type: "user", id: viewer.viewerId }),
    ]);

    if (wishlists.length === 0 || !mySellList) {
      return [];
    }

    const [wishPages, offers] = await Promise.all([
      Promise.all(wishlists.map((wishlist) => getWishlistItems(wishlist.id, { limit: TRADE_SCAN_LIMIT }))),
      getSellListItems(mySellList.id, { limit: TRADE_SCAN_LIMIT }),
    ]);

    return matchWishesToOffers(
      wishPages.flatMap((page) =>
        page.items.map((item) => ({
          cardId: item.cardId,
          name: item.name,
          gameName: item.gameName,
          image: item.image,
          addedByUserId: user.id,
        })),
      ),
      offers.items.map((item) => ({
        cardId: item.cardId,
        addedByUserId: viewer.viewerId!,
        price: item.price,
        currency: item.currency,
      })),
    );
  },
);

/** Le compte du visiteur, pour l'amorçage de sa propre vitrine. */
export const readOwnUser = cache(async (userId: string) => getUserById(userId));
