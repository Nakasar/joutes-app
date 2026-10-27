import "server-only";

import { DateTime } from "luxon";

import { getLairIdsNearLocation, getLairsByIds } from "@/lib/db/lairs";
import { getAllEvents, getEventsByLairIds, getEventsForUser, getEventsWithUsers } from "@/lib/db/events";
import { HIGHLIGHT_WINDOW_DAYS, pickHighlights } from "@/lib/events/highlights";
import { withHighlights } from "@/lib/events/highlights-service";
import { getNews } from "@/lib/db/news";
import { listRecentPublicContents } from "@/lib/db/user-contents";
import { listRecentSocialPosts } from "@/lib/db/game-social-posts";
import { getFeaturedDecks, searchDecks } from "@/lib/db/decks";
import { listLiveGameStreams } from "@/lib/db/game-streams";
import { readLiveEmbed } from "@/lib/media/live-embed";
import { selectMenuGames, type GamesMenuSource } from "@/lib/games/nav-menu";
import type { Deck } from "@/lib/types/Deck";
import type { Event } from "@/lib/types/Event";
import type { Game } from "@/lib/types/Game";
import type { Lair } from "@/lib/types/Lair";
import type { User } from "@/lib/types/User";

import {
  JEUX_PAR_DEFAUT,
  JOURS_A_VENIR,
  MAX_DECKS,
  MAX_EVENEMENTS,
  MAX_FIL,
  RAYON_DEFAUT_KM,
} from "./constants";
import {
  contentEntry,
  deckEntry,
  feedGameScope,
  newsEntry,
  socialEntry,
  sortFeedEntries,
  type FeedEntry,
} from "./entries";

/**
 * Les lectures de l'accueil, paramétrées par qui regarde.
 *
 * La page (`app/[locale]/(app)/_accueil/accueil-data.ts`) les mémoïse par
 * rendu et y ajoute ses chemins ; `GET /feed` les appelle telles quelles pour
 * l'application mobile. Une règle — « les jeux qu'on suit », « les lieux
 * suivis, sinon ceux autour de la position » — n'est donc écrite qu'ici, et
 * le téléphone montre le même accueil que le site.
 */

/** La position que la page regarde, et d'où elle la tient. */
export type Position = {
  latitude: number;
  longitude: number;
  radiusKm: number;
  /** Le nom de la localité, quand elle en a un. */
  name?: string;
};

/**
 * La position retenue, par ordre de précision décroissante : celle demandée,
 * puis celle que le compte a enregistrée. Un visiteur sans l'une ni l'autre
 * n'a pas de position, et rien ne lui en invente une.
 */
export function readPosition(
  requested: { lat?: string | null; lon?: string | null; radius?: string | null; name?: string | null },
  viewer: User | null,
): Position | null {
  const latitude = Number.parseFloat(requested.lat ?? "");
  const longitude = Number.parseFloat(requested.lon ?? "");

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const radius = Number.parseFloat(requested.radius ?? "");
    return {
      latitude,
      longitude,
      radiusKm: Number.isFinite(radius) && radius > 0 ? radius : RAYON_DEFAUT_KM,
      name: requested.name ?? undefined,
    };
  }

  const saved = viewer?.location;
  if (saved?.latitude != null && saved?.longitude != null) {
    // Le compte garde le point et son étiquette, jamais le rayon : celui-ci
    // appartient à la recherche, pas au lieu de vie.
    return {
      latitude: saved.latitude,
      longitude: saved.longitude,
      radiusKm: RAYON_DEFAUT_KM,
      name: saved.label ?? saved.city,
    };
  }

  return null;
}

/** Un jeu du catalogue, par identifiant ou par slug. */
export function findGame(games: Game[], idOrSlug: string | null | undefined): Game | null {
  if (!idOrSlug) return null;
  return games.find((game) => game.id === idOrSlug || game.slug === idOrSlug) ?? null;
}

export type HomeGames = {
  source: GamesMenuSource;
  games: { id: string; name: string; slug: string | null; icon?: string }[];
};

/**
 * Les jeux de la barre : les favoris, sinon les suivis, sinon trois jeux par
 * défaut — la règle du menu du site (`selectMenuGames`).
 */
export function readHomeGames(viewer: User | null, allGames: Game[]): HomeGames {
  const followed = allGames.filter((game) => viewer?.games?.includes(game.id));
  const defaults = allGames.filter((game) => game.slug && JEUX_PAR_DEFAUT.includes(game.slug));

  const selection = selectMenuGames({
    followed,
    favoriteIds: viewer?.favoriteGames ?? [],
    defaults: defaults.length > 0 ? defaults : allGames.slice(0, 3),
  });

  return {
    source: selection.source,
    games: selection.games.map((game) => {
      const full = allGames.find((entry) => entry.id === game.id);
      return { id: game.id, name: game.name, slug: game.slug ?? null, icon: full?.icon };
    }),
  };
}

/**
 * Les lieux que la page a le droit de montrer : les suivis pour un compte —
 * un choix explicite vaut mieux qu'une proximité devinée — sinon ceux autour
 * de la position, du plus proche au plus lointain, et rien sans position.
 */
export async function readHomeLairs(
  viewer: User | null,
  position: Position | null,
): Promise<{ source: "followed" | "nearby" | "none"; lairs: Lair[] }> {
  const followed = viewer?.lairs ?? [];
  if (followed.length > 0) {
    return { source: "followed", lairs: await getLairsByIds(followed) };
  }

  if (!position) {
    return { source: "none", lairs: [] };
  }

  const near = await getLairIdsNearLocation(position.longitude, position.latitude, position.radiusKm * 1000);
  const lairs = await getLairsByIds(near);
  const rank = new Map(near.map((id, index) => [id, index]));
  return {
    source: "nearby",
    lairs: lairs.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)),
  };
}

export type HomeLive = {
  /** `game:<id>` ou `lair:<id>` : deux sources, une seule clé de rendu. */
  key: string;
  kind: "game" | "lair";
  id: string;
  title: string;
  /** Ce qui diffuse — le nom du lieu, ou celui de la chaîne. */
  source: string;
  url: string;
  thumbnail?: string;
  viewers?: number;
};

/**
 * Les directs en cours : ceux des éditeurs d'abord — rares, et relégués sous
 * trois boutiques ils ne seraient jamais vus — puis ceux des lieux, qui ne
 * coûtent aucune requête (`options.live` est sur le lieu déjà lu).
 *
 * Connecté, les jeux suivis ; un visiteur voit tous les directs d'éditeurs.
 */
export async function readHomeLives(
  viewer: User | null,
  lairs: Lair[],
  allGames: Game[],
): Promise<HomeLive[]> {
  const lives: HomeLive[] = [];

  for (const stream of await listLiveGameStreams(viewer ? (viewer.games ?? []) : undefined)) {
    const live = stream.live;
    if (!live?.url) continue;
    const game = allGames.find((entry) => entry.id === stream.gameId);
    if (!game) continue;

    lives.push({
      key: `game:${stream.gameId}`,
      kind: "game",
      id: stream.gameId,
      title: live.title ?? game.name,
      source: stream.channelTitle ?? game.name,
      url: live.url,
      // L'hôte ne sert qu'au `parent` du lecteur Twitch ; la vignette, elle,
      // ne dépend de rien.
      thumbnail: readLiveEmbed(live.url, "localhost")?.thumbnailUrl,
    });
  }

  for (const lair of lairs) {
    const live = lair.options?.live;
    if (!live?.url) continue;

    lives.push({
      key: `lair:${lair.id}`,
      kind: "lair",
      id: lair.id,
      title: live.title ?? lair.name,
      source: lair.name,
      url: live.url,
      viewers: live.viewers ?? undefined,
    });
  }

  return lives;
}

/**
 * Ce qui vient dans les sept prochains jours, du plus personnel au plus
 * général : un compte croise ses lieux suivis, ses inscriptions et ses
 * favoris sur les jeux qu'il suit ; un visiteur situé lit les lieux dans le
 * rayon ; un visiteur sans position lit tout ce qui se passe.
 *
 * Chaque événement porte ses marques (`highlights`) : les fiches les affichent.
 */
export async function readHomeAgenda(
  viewer: User | null,
  position: Position | null,
  game: Game | null,
  now: DateTime = DateTime.now(),
): Promise<Event[]> {
  const events = (await readAgendaWindow(viewer, position, game, now, JOURS_A_VENIR)).slice(0, MAX_EVENEMENTS);
  return withHighlights(events, viewer);
}

/**
 * « À ne pas manquer » : les événements des deux prochaines semaines qui
 * portent une marque — des amis y vont, le lieu les a choisis, ils sont
 * populaires —, pris dans le même périmètre que l'agenda, plus ceux où vont
 * des amis. Ceux où la personne est déjà inscrite n'y figurent pas : ils sont
 * déjà dans « Ce qui m'attend ».
 */
export async function readHomeHighlights(
  viewer: User | null,
  position: Position | null,
  game: Game | null,
  now: DateTime = DateTime.now(),
): Promise<Event[]> {
  const end = now.plus({ days: HIGHLIGHT_WINDOW_DAYS });
  const friendIds = viewer?.friends ?? [];

  const [scope, withFriends] = await Promise.all([
    readAgendaWindow(viewer, position, game, now, HIGHLIGHT_WINDOW_DAYS),
    friendIds.length > 0
      ? getEventsWithUsers(friendIds, {
          afterDate: now.toISO() ?? "",
          beforeDate: end.toISO() ?? "",
          gameIds: game ? [game.id] : undefined,
        })
      : Promise.resolve([] as Event[]),
  ]);

  // Plafonné : sans position ni compte, le périmètre est tout l'agenda de la
  // quinzaine, et les marques se lisent par lots d'identifiants.
  const candidates = [...withFriends, ...scope].slice(0, MAX_CANDIDATS_MIS_EN_AVANT);
  return pickHighlights(await withHighlights(candidates, viewer), viewer?.id);
}

/** Ce que l'accueil regarde au plus pour composer « À ne pas manquer ». */
const MAX_CANDIDATS_MIS_EN_AVANT = 400;

/**
 * Les événements à venir sur `days` jours, dans le périmètre de l'accueil,
 * triés par date. `readHomeAgenda` en garde les premiers ; « À ne pas
 * manquer » y cherche les événements marqués.
 */
async function readAgendaWindow(
  viewer: User | null,
  position: Position | null,
  game: Game | null,
  now: DateTime,
  days: number,
): Promise<Event[]> {
  const end = now.plus({ days });
  const bounds = { afterDate: now.toISO() ?? undefined, beforeDate: end.toISO() ?? undefined };

  let events: Event[];

  if (viewer) {
    events = await getEventsForUser(
      viewer.id,
      game?.id ?? "followed",
      undefined,
      undefined,
      position ? { latitude: position.latitude, longitude: position.longitude } : undefined,
      position?.radiusKm,
      bounds,
    );
  } else if (position) {
    const near = await getLairIdsNearLocation(position.longitude, position.latitude, position.radiusKm * 1000);
    events = await getEventsByLairIds(near, { ...bounds, gameIds: game ? [game.id] : undefined });
  } else {
    // La fenêtre peut chevaucher deux mois : on lit les deux et on recolle.
    const thisMonth = await getAllEvents({ year: now.year, month: now.month });
    const nextMonth =
      end.month === now.month && end.year === now.year
        ? []
        : await getAllEvents({ year: end.year, month: end.month });
    events = [...thisMonth, ...nextMonth];
  }

  const startMs = now.toMillis();
  const endMs = end.toMillis();

  return events
    .filter((event) => {
      if (event.status === "cancelled") return false;
      // Les deux premiers chemins filtrent déjà en base ; ce garde-fou sert
      // au troisième. Un événement moissonné n'a souvent qu'un `gameName`.
      if (game) {
        const matches = (game.slug != null && event.game?.slug === game.slug) || event.gameName === game.name;
        if (!matches) return false;
      }
      const start = DateTime.fromISO(event.startDateTime).toMillis();
      return start >= startMs && start <= endMs;
    })
    .sort((a, b) => DateTime.fromISO(a.startDateTime).toMillis() - DateTime.fromISO(b.startDateTime).toMillis());
}

/**
 * Le fil : actualités, contenus de membres, decks et publications des
 * réseaux, quatre sources mêlées et triées par date. Le filtrage par jeu se
 * fait **en base**, chaque source acceptant une liste : lire large puis
 * filtrer en mémoire viderait le fil de qui suit un jeu discret parmi des
 * jeux bavards. `limit` borne chaque source ; le fil rendu en fait au plus
 * quatre fois autant, et c'est l'appelant qui plafonne (`feed-mix.ts`).
 */
export async function readHomeFeed(
  gameIds: string[] | undefined,
  locale: string,
  limit: number = MAX_FIL,
): Promise<FeedEntry[]> {
  const [news, contents, decks, posts] = await Promise.all([
    getNews({ gameId: gameIds, limit }),
    listRecentPublicContents({ gameId: gameIds, limit }),
    getFeaturedDecks(gameIds, limit),
    listRecentSocialPosts({ gameIds, limit }),
  ]);

  return sortFeedEntries([
    ...news.news.map((item) => newsEntry(item, locale)),
    ...contents.map(contentEntry),
    ...decks.map(deckEntry),
    ...posts.map(socialEntry),
  ]);
}

/** Sur quels jeux le fil et le reste se lisent, pour ce viewer et ce choix. */
export function readGameScope(viewer: User | null, game: Game | null): string[] | undefined {
  return feedGameScope(game?.id, viewer?.games);
}

/** Les decks de la personne, les plus récemment touchés d'abord ; sinon les vedettes. */
export async function readHomeDecks(
  viewer: User | null,
  game: Game | null,
): Promise<{ source: "mine" | "featured"; decks: Deck[] }> {
  if (viewer) {
    const result = await searchDecks({ playerId: viewer.id, page: 1, limit: MAX_DECKS });
    if (result.decks.length > 0) {
      return { source: "mine", decks: result.decks };
    }
  }

  return { source: "featured", decks: await getFeaturedDecks(game?.id, MAX_DECKS) };
}
