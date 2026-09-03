import 'server-only';

import { DateTime } from "luxon";

import { getEventsByLairIds } from "@/lib/db/events";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getLairById, getLairsByIds } from "@/lib/db/lairs";
import { getPosterForUser, getPostersByUser } from "@/lib/db/posters";
import { getUserById } from "@/lib/db/users";
import { isAdmin } from "@/lib/config/admins";
import { lairHasPro, plansForUserId } from "@/lib/subscriptions/access";
import { grantsEntitlement } from "@/lib/subscriptions/entitlements";
import { POSTER_ZONE, posterRange, readPosterStart, type PosterRange } from "@/lib/posters/period";
import { posterVenue, type PosterVenueStrings } from "@/lib/posters/selection";
import { readPosterOptions, type PosterOptions } from "@/lib/posters/styles";
import { findPosterChoiceByName, parsePosterRef, type PosterChoice, type PosterRef } from "@/lib/posters/references";
import { siteOrigin, type PosterSubject } from "@/components/posters/Poster.tsx";
import type { Event } from "@/lib/types/Event";
import type { Game } from "@/lib/types/Game";
import type { Lair } from "@/lib/types/Lair";
import type { User } from "@/lib/types/User";

/**
 * La bibliothèque d'affiches d'un compte, lue **sans session**.
 *
 * Les pages d'affiche lisent la session pour savoir qui regarde
 * (`visibleLairsAmong`, `hasEntitlement`). Un bot n'en a pas : il tient un
 * identifiant de compte, obtenu en rapprochant l'identité Discord de la
 * liaison enregistrée. Ce module refait donc les mêmes contrôles à partir de
 * cet identifiant, et rien qu'à partir de lui.
 *
 * Deux choses peuvent s'afficher, et ce sont celles qu'un compte a déjà
 * choisies : les affiches qu'il a **gardées**, et les lieux qu'il **suit**.
 * Ce sont elles que l'autocomplétion propose. Une affiche gardée appartient à
 * son compte et à lui seul ; un lieu, lui, suit la règle de sa vitrine —
 * public pour tous, privé pour ceux qui le suivent et pour son équipe —, si
 * bien qu'un identifiant tapé à la main n'ouvre jamais que ce que le site
 * ouvrirait déjà.
 */

/** Ce qu'une affiche a besoin de savoir pour se dessiner, HTML ou image. */
export type ResolvedPoster = {
  ref: PosterRef;
  /** Le nom de l'affiche gardée, ou celui du lieu. */
  name: string;
  subject: PosterSubject;
  events: Event[];
  games: Game[];
  range: PosterRange;
  options: PosterOptions;
  /** L'adresse de la même affiche sur le site, à ouvrir dans un navigateur. */
  url: string;
};

/**
 * Pourquoi une affiche ne s'est pas résolue.
 *
 * Une chaîne plutôt qu'une exception : l'appelant en fait une phrase, et il
 * n'y a rien d'exceptionnel à demander une affiche qu'on a supprimée.
 */
export type PosterLookupFailure = "unknown" | "empty";

/**
 * Les affiches et les lieux d'un compte, les affiches d'abord.
 *
 * L'ordre est celui de l'autocomplétion : ce qu'on a composé soi-même passe
 * avant ce qu'on suit, et la dernière affiche touchée arrive en tête —
 * `getPostersByUser` trie déjà ainsi.
 */
export async function listAccountPosters(userId: string): Promise<PosterChoice[]> {
  const user = await getUserById(userId);

  const [posters, lairs] = await Promise.all([
    getPostersByUser(userId),
    getLairsByIds(user?.lairs ?? []),
  ]);

  return [
    ...posters.map((poster) => ({ kind: "poster" as const, id: poster.id, name: poster.name })),
    ...lairs.map((lair) => ({ kind: "lair" as const, id: lair.id, name: lair.name })),
  ];
}

/**
 * L'affiche que désigne ce que l'utilisateur a envoyé.
 *
 * La valeur est soit une référence choisie dans l'autocomplétion
 * (`poster:<id>`), soit un nom tapé à la main : les deux mènent au même
 * endroit, et un nom inconnu ne rend rien plutôt que de rendre une affiche
 * approchante que personne n'a demandée.
 */
export async function resolveAccountPoster(
  userId: string,
  value: string,
  strings: PosterVenueStrings,
  now: DateTime = DateTime.now().setZone(POSTER_ZONE),
): Promise<ResolvedPoster | PosterLookupFailure> {
  const ref = parsePosterRef(value) ?? findPosterChoiceByName(await listAccountPosters(userId), value);

  if (!ref) {
    return "unknown";
  }

  return ref.kind === "poster"
    ? resolveSavedPoster(userId, ref.id, strings, now)
    : resolveLairPoster(userId, ref.id, now);
}

/**
 * Une affiche gardée : des lieux, des jeux, une période et un habillage.
 *
 * Jamais une date — c'est une recette, et c'est tout l'intérêt d'en garder
 * une : demandée un mardi de novembre, elle montre la semaine de novembre.
 */
async function resolveSavedPoster(
  userId: string,
  posterId: string,
  strings: PosterVenueStrings,
  now: DateTime,
): Promise<ResolvedPoster | PosterLookupFailure> {
  const poster = await getPosterForUser(posterId, userId);

  if (!poster) {
    return "unknown";
  }

  const [user, found] = await Promise.all([getUserById(userId), getLairsByIds(poster.lairIds)]);

  // L'ordre enregistré est celui que l'affiche écrit sous son titre : il
  // appartient à qui l'a composée, et la lecture par identifiants ne le garde
  // pas.
  const byId = new Map(found.map((lair) => [lair.id, lair]));
  const lairs = poster.lairIds
    .map((id) => byId.get(id))
    .filter((lair): lair is Lair => lair !== undefined && canSeeLair(lair, user));

  // Un lieu devenu privé depuis l'enregistrement disparaît de l'affiche,
  // exactement comme sur la page : plus aucun lieu visible, et il n'y a pas
  // d'affiche à rendre.
  if (lairs.length === 0) {
    return "empty";
  }

  const unlocked = await hasPosterStyles(user);
  const options = readPosterOptions(undefined, unlocked, {
    style: poster.style,
    showAttendance: poster.showAttendance,
    gameLogos: poster.gameLogos,
  });

  const range = posterRange(poster.period, readPosterStart(undefined, POSTER_ZONE, now));
  const games = await readGames(lairs);

  // Le filtre par jeu se fait sur le **nom** que porte l'événement : c'est le
  // seul lien entre un événement et un jeu en base.
  const asked = new Set(poster.gameIds);
  const keptNames =
    asked.size > 0
      ? new Set(games.filter((game) => asked.has(game.id) || (game.slug && asked.has(game.slug))).map((game) => game.name))
      : null;

  const events = await readEvents(lairs, range);
  const query = new URLSearchParams({ lairs: lairs.map((lair) => lair.id).join(",") });

  if (poster.gameIds.length > 0) query.set("games", poster.gameIds.join(","));
  if (poster.period !== "week") query.set("period", poster.period);
  query.set("style", options.style);
  query.set("attendance", options.showAttendance ? "1" : "0");
  query.set("logos", options.gameLogos ? "1" : "0");

  return {
    ref: { kind: "poster", id: poster.id },
    name: poster.name,
    subject: {
      venue: posterVenue(lairs, strings),
      url: siteOrigin(),
      // Plusieurs lieux : chaque ligne dit le sien, sans quoi l'affiche
      // annonce des soirées sans dire où elles ont lieu.
      showVenues: lairs.length > 1,
    },
    events: keptNames ? events.filter((event) => keptNames.has(event.gameName)) : events,
    games,
    range,
    options,
    url: `${siteOrigin()}/affiche?${query.toString()}`,
  };
}

/**
 * L'affiche d'un lieu : la sienne, celle qu'il publie, avec ses réglages.
 *
 * Le style réservé et la signature du pied de page suivent l'abonnement **du
 * lieu**, et non celui du compte qui demande l'image : c'est le programme du
 * lieu, pas une affiche composée.
 */
async function resolveLairPoster(
  userId: string,
  lairId: string,
  now: DateTime,
): Promise<ResolvedPoster | PosterLookupFailure> {
  const [user, lair] = await Promise.all([getUserById(userId), getLairById(lairId)]);

  if (!lair || !canSeeLair(lair, user)) {
    return "unknown";
  }

  const isPro = await lairHasPro(lair.id);
  const options = readPosterOptions(lair.options?.poster, isPro);
  const range = posterRange("week", readPosterStart(undefined, POSTER_ZONE, now));
  const [games, events] = await Promise.all([readGames([lair]), readEvents([lair], range)]);

  return {
    ref: { kind: "lair", id: lair.id },
    name: lair.name,
    subject: {
      venue: { name: lair.name, address: lair.address || undefined },
      url: `${siteOrigin()}/lairs/${lair.id}`,
      // Un seul lieu : son nom est déjà en tête, chaque ligne n'a pas à le
      // répéter.
      showVenues: false,
    },
    events,
    games,
    range,
    options,
    url: `${siteOrigin()}/lairs/${lair.id}/affiche`,
  };
}

/**
 * Le droit de voir ce lieu, sans session.
 *
 * Même règle que `visibleLairsAmong` : public pour tous, privé pour ceux qui
 * le suivent et pour son équipe. L'administration y est aussi, par le compte —
 * un administrateur qui poste une affiche depuis Discord est le même que celui
 * qui l'ouvre sur le site.
 */
function canSeeLair(lair: Lair, user: User | null): boolean {
  if (!lair.isPrivate) {
    return true;
  }

  if (!user) {
    return false;
  }

  return (
    (user.lairs ?? []).includes(lair.id) ||
    lair.owners.includes(user.id) ||
    isAdmin(user.email)
  );
}

/** Le verrou des quatre styles réservés, lu sur le compte qui demande. */
async function hasPosterStyles(user: User | null): Promise<boolean> {
  if (!user) {
    return false;
  }

  if (isAdmin(user.email)) {
    return true;
  }

  return grantsEntitlement(await plansForUserId(user.id), "sub:poster-styles");
}

/** Les jeux des lieux retenus : ce sont eux qui portent les couleurs. */
async function readGames(lairs: Lair[]): Promise<Game[]> {
  const gameIds = [...new Set(lairs.flatMap((lair) => lair.games))];
  const games = await Promise.all(gameIds.map((gameId) => getGameBySlugOrId(gameId)));

  return games.filter((game): game is Game => game !== null);
}

/**
 * Les événements de la période, fenêtre élargie d'un jour de chaque côté : la
 * comparaison se fait en base sur la chaîne ISO, et deux événements écrits
 * avec des décalages différents s'y départagent mal. `eventsInRange` refait le
 * cadrage sur l'instant, proprement.
 */
async function readEvents(lairs: Lair[], range: PosterRange): Promise<Event[]> {
  return getEventsByLairIds(lairs.map((lair) => lair.id), {
    afterDate: range.start.minus({ days: 1 }).toISO() ?? undefined,
    beforeDate: range.end.plus({ days: 1 }).endOf("day").toISO() ?? undefined,
  });
}
