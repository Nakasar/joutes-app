import type { Deck } from "@/lib/types/Deck";
import type { News } from "@/lib/types/News";
import type { UserContent, UserContentKind } from "@/lib/types/UserContent";
import type { GameSocialPost } from "@/lib/types/GameSocialPost";
import type { SocialPlatform } from "@/lib/social/platforms";
import { deckCoverPosition, resolveDeckCover } from "@/lib/decks/cover";
import { formatSocialDuration } from "@/lib/social/youtube-posts";

/**
 * Une entrée du fil de l'accueil, quelle que soit son origine.
 *
 * Actualités, vidéos de membres, decks et publications des réseaux n'ont ni la
 * même forme ni la même collection ; le fil les met sur la même carte. La
 * conversion se fait ici, une fois, pour la page **et** pour `GET /feed`.
 *
 * Les entrées portent des **identifiants, pas des chemins** : l'application
 * mobile a ses propres routes, et un `href` du site ne lui dirait pas ce qu'il
 * désigne. Le site ajoute le sien après coup (`accueil-data.ts`).
 *
 * Pur, donc testé (`entries.test.ts`).
 */
type FeedEntryBase = {
  id: string;
  title: string;
  /** Qui publie : l'auteur d'une actualité, le compte d'un réseau, le créateur d'un deck. */
  source: string;
  gameId?: string;
  /** ISO 8601 — le tri du fil, et l'ancienneté affichée. */
  publishedAt: string;
  thumbnail?: string;
};

export type FeedNewsEntry = FeedEntryBase & { type: "news" };

export type FeedContentEntry = FeedEntryBase & {
  type: "content";
  kind: UserContentKind;
  authorId: string;
  summary?: string;
  /** L'adresse de la vidéo ou du replay ; un article n'en a pas, il se lit sur Joutes. */
  url?: string;
  /** Telle que l'auteur l'a écrite — « 12 min ». */
  duration?: string;
};

export type FeedDeckEntry = FeedEntryBase & {
  type: "deck";
  /**
   * Le cadrage de la vignette : une illustration de carte porte son sujet en
   * haut, une image déposée se cadre au centre. Voyage avec l'adresse pour
   * que le fil cadre comme la librairie.
   */
  framing: "top" | "center";
};

export type FeedSocialEntry = FeedEntryBase & {
  type: "social";
  url: string;
  platform: SocialPlatform;
  kind: GameSocialPost["kind"];
  accountUrl: string;
  avatar?: string;
  /** « 12:34 » — les vidéos et shorts seulement. */
  duration?: string;
};

export type FeedEntry = FeedNewsEntry | FeedContentEntry | FeedDeckEntry | FeedSocialEntry;

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/**
 * Le titre dans la langue demandée, sans dépendre de `localizeNews` : le fil
 * n'a besoin que du titre, là où la page d'une actualité lit tout le document.
 */
export function newsTitle(news: Pick<News, "title" | "translations">, locale: string): string {
  const translation = news.translations?.find((entry) => entry.lang === locale);
  return translation?.title ?? news.title;
}

export function newsEntry(news: News, locale: string): FeedNewsEntry {
  return {
    type: "news",
    id: news.id,
    title: newsTitle(news, locale),
    source: news.author?.displayName ?? "",
    gameId: news.gameIds?.[0],
    publishedAt: iso(news.createdAt),
    thumbnail: news.banner,
  };
}

export function contentEntry(content: UserContent): FeedContentEntry {
  return {
    type: "content",
    id: content.id,
    kind: content.kind,
    authorId: content.authorId,
    title: content.title,
    source: content.summary ?? "",
    summary: content.summary,
    url: content.url,
    gameId: content.gameId,
    publishedAt: content.publishedAt,
    thumbnail: content.thumbnail,
    duration: content.duration,
  };
}

/**
 * La couverture du deck, résolue comme partout ailleurs — sans catalogue : le
 * fil est une liste, et `coverImage` est la valeur dénormalisée que les listes
 * lisent. La provenance voyage avec l'adresse, parce qu'elle décide du cadrage.
 */
export function deckEntry(deck: Deck): FeedDeckEntry {
  const cover = resolveDeckCover(deck);

  return {
    type: "deck",
    id: deck.id,
    title: deck.name,
    source: deck.creatorName ?? "",
    gameId: deck.gameId,
    publishedAt: iso(deck.updatedAt),
    thumbnail: cover.image,
    framing: deckCoverPosition(cover.source),
  };
}

/**
 * Le **texte est le titre** : une publication n'en a pas d'autre. Sans texte,
 * le compte — un titre vide laisserait une carte muette. `source` porte le
 * handle et non la plateforme : celle-ci est dite par le logo.
 */
export function socialEntry(post: GameSocialPost): FeedSocialEntry {
  return {
    type: "social",
    id: post.id,
    title: post.text ?? post.account.displayName ?? post.account.handle,
    source: post.account.handle,
    url: post.url,
    platform: post.platform,
    kind: post.kind,
    accountUrl: post.account.url,
    avatar: post.account.avatar,
    gameId: post.gameId,
    publishedAt: post.publishedAt,
    thumbnail: post.thumbnail,
    duration: formatSocialDuration(post.durationSeconds),
  };
}

/** Le fil, de la plus récente à la plus ancienne. Stable : deux dates égales gardent leur ordre. */
export function sortFeedEntries<T extends { publishedAt: string }>(entries: T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index, at: Date.parse(entry.publishedAt) || 0 }))
    .sort((a, b) => b.at - a.at || a.index - b.index)
    .map(({ entry }) => entry);
}

/**
 * Sur quels jeux le fil se lit : un jeu choisi l'emporte sur tout ; sinon les
 * jeux qu'on suit ; sinon rien, ce qui ne filtre pas — un visiteur, ou qui ne
 * suit encore aucun jeu, découvre par le fil.
 */
export function feedGameScope(
  chosenGameId: string | null | undefined,
  followedGameIds: string[] | undefined,
): string[] | undefined {
  if (chosenGameId) return [chosenGameId];
  return followedGameIds && followedGameIds.length > 0 ? followedGameIds : undefined;
}
