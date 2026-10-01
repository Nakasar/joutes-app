import { DateTime } from "luxon";
import type { EventSource } from "@/lib/types/Lair";
import type { Game } from "@/lib/types/Game";
import {
  canonicalGameName,
  findGameInText,
  normalizeEventName,
  normalizeEventPrice,
  resolveEventDates,
  type EventStatus,
  type SourceEvent,
} from "./source-events";

/**
 * Une source Hobbynext : l'agenda qu'Asmodee tient pour les boutiques
 * (https://event.hobbynext.com), lu par son API publique.
 *
 * Le lieu y est désigné par son identifiant d'organisateur — `owner` —, qui
 * n'apparaît nulle part dans l'interface du site : on le lit sur la fiche d'un
 * de ses événements (`GET /api/events/:id/` → `owner`), ce que le formulaire
 * de l'administration sait faire à partir d'un lien.
 *
 * Deux pièges, que cette lecture règle :
 *
 * - **les dates** : les événements saisis sur Hobbynext (`Full`, `Light`)
 *   portent l'heure **locale** suivie d'un `Z` mensonger — « 19:30:00Z » pour
 *   une soirée qui commence à 19 h 30 à Thionville, comme le confirme
 *   `daily_schedules`. Ceux importés d'une autre plateforme (`External` —
 *   Star Wars: Unlimited, par exemple) sont, eux, en vrai UTC ;
 * - **les jeux** : Hobbynext les nomme en anglais et par identifiant
 *   (`game: 25`, « Forest Shuffle ») — la liste `GET /api/games/` donne les
 *   noms, les alias de la source font le reste. « Other » ne dit rien : on
 *   cherche alors le jeu dans le titre.
 *
 * Tout est pur : `refresh-events` télécharge et appelle `extractHobbynextEvents`.
 */

export const HOBBYNEXT_API_ORIGIN = "https://optool-api.asmodee.net";

/** La page publique d'un événement, où envoyer les joueurs. */
export const HOBBYNEXT_EVENT_PAGE = "https://event.hobbynext.com/fr/events/";

/** Le nom qu'Hobbynext donne aux jeux qu'il ne connaît pas. */
const HOBBYNEXT_OTHER_GAME = "other";

/** Un identifiant d'organisateur, ou d'événement : un entier positif. */
export function isHobbynextId(value: string): boolean {
  return /^\d{1,12}$/.test(value.trim());
}

/**
 * L'adresse enregistrée comme `url` de la source : la liste des événements de
 * l'organisateur. C'est la clé du rapprochement — un événement sait de quelle
 * source il vient —, et ce qu'affiche le rapport.
 */
export function hobbynextSourceUrl(ownerId: string): string {
  return `${HOBBYNEXT_API_ORIGIN}/api/events/?owner=${encodeURIComponent(ownerId.trim())}`;
}

/** La première page de la liste, à la taille que l'API accepte. */
export function hobbynextListUrl(ownerId: string, pageSize = 50): string {
  return `${hobbynextSourceUrl(ownerId)}&page=1&page_size=${pageSize}`;
}

export function hobbynextEventApiUrl(eventId: string): string {
  return `${HOBBYNEXT_API_ORIGIN}/api/events/${encodeURIComponent(eventId.trim())}/`;
}

export const HOBBYNEXT_GAMES_URL = `${HOBBYNEXT_API_ORIGIN}/api/games/`;

/**
 * L'identifiant d'événement d'un lien Hobbynext — « https://event.hobbynext.com/fr/events/38425 » —,
 * ou de l'identifiant lui-même. `null` pour tout le reste.
 */
export function parseHobbynextEventRef(value: string): string | null {
  const text = value.trim();
  if (isHobbynextId(text)) return text;

  try {
    const url = new URL(text);
    const match = /\/events\/(\d{1,12})\/?$/.exec(url.pathname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Les domaines des pages publiques d'Hobbynext : ce qu'un gérant colle. */
const HOBBYNEXT_HOSTS = ["hobbynext.com"];

/** Une page publique d'Hobbynext — `https://event.hobbynext.com/fr/events/38425`. */
export function isHobbynextPageUrl(value: string): boolean {
  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase();
    return HOBBYNEXT_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/**
 * L'identifiant d'organisateur que porte l'URL enregistrée d'une source
 * (`hobbynextSourceUrl`), ou `null`. C'est ainsi qu'une source déjà connectée
 * se relit sans repasser par le lien d'un événement.
 */
export function hobbynextOwnerFromSourceUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.origin !== HOBBYNEXT_API_ORIGIN || url.pathname !== "/api/events/") return null;
    const owner = url.searchParams.get("owner");
    return owner && isHobbynextId(owner) ? owner : null;
  } catch {
    return null;
  }
}

/**
 * Ce que la recherche de l'organisateur d'un événement a donné.
 *
 * - `NOT_FOUND` : Hobbynext ne connaît pas l'événement — ou c'est un
 *   événement importé d'une autre plateforme (Star Wars: Unlimited…), que
 *   l'API ne sert pas à l'unité ;
 * - `NO_ORGANIZER` : l'événement existe, mais n'a pas d'organisateur
 *   Hobbynext — encore un événement importé ;
 * - `FAILED` : Hobbynext n'a pas répondu comme attendu.
 */
export type HobbynextOwnerLookup =
  | { ok: true; ownerId: string; eventName?: string; city?: string }
  | { ok: false; reason: "NOT_FOUND" | "NO_ORGANIZER" | "FAILED"; message?: string };

/** Lit l'organisateur dans la fiche d'un événement (`GET /api/events/:id/`). */
export function readHobbynextOwner(data: unknown): HobbynextOwnerLookup {
  const event = (data ?? {}) as { owner?: unknown; name?: unknown; address?: { city?: unknown } | null };
  const owner = typeof event.owner === "number" || typeof event.owner === "string" ? String(event.owner) : "";

  if (!owner || !isHobbynextId(owner)) return { ok: false, reason: "NO_ORGANIZER" };

  return {
    ok: true,
    ownerId: owner,
    ...(typeof event.name === "string" && event.name.trim() ? { eventName: event.name.trim() } : {}),
    ...(typeof event.address?.city === "string" && event.address.city.trim() ? { city: event.address.city.trim() } : {}),
  };
}

/**
 * La page suivante d'une liste, si elle reste sur l'API d'Asmodee. Une
 * réponse qui renverrait ailleurs ne fait pas partir le serveur à sa suite.
 */
export function nextHobbynextPage(data: unknown): string | null {
  const next = (data as { next?: unknown } | null)?.next;
  if (typeof next !== "string" || !next) return null;

  try {
    const url = new URL(next);
    return url.origin === HOBBYNEXT_API_ORIGIN ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Les événements d'une page de liste : `{ results: [...] }`. */
export function hobbynextResults(data: unknown): unknown[] | null {
  const results = (data as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? results : null;
}

/** La table identifiant → nom de `GET /api/games/`. */
export function readHobbynextGames(data: unknown): Map<number, string> {
  const games = new Map<number, string>();
  if (!Array.isArray(data)) return games;

  for (const game of data) {
    const { id, name } = (game ?? {}) as { id?: unknown; name?: unknown };
    if (typeof id === "number" && typeof name === "string" && name.trim()) {
      games.set(id, name.trim());
    }
  }

  return games;
}

type HobbynextEvent = {
  id?: unknown;
  name?: unknown;
  game?: unknown;
  event_type?: unknown;
  event_start_date?: unknown;
  event_visibility?: unknown;
  additional_info?: {
    event_end_date?: unknown;
    event_price?: unknown;
    remaining_seats?: unknown;
  } | null;
};

/**
 * Une date telle qu'Hobbynext l'écrit, prête pour `resolveEventDates`.
 *
 * Pour un événement saisi sur Hobbynext, le `Z` est ôté : l'heure est celle
 * du lieu. Pour un événement importé (`External`), elle est gardée : c'est
 * un vrai UTC.
 */
export function hobbynextDate(value: unknown, eventType: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (eventType === "External") return value.trim();
  return value.trim().replace(/(Z|[+-]\d{2}:?\d{2})$/i, "");
}

export type HobbynextExtraction = {
  events: SourceEvent[];
  warnings: string[];
};

/**
 * Les événements d'une liste Hobbynext, au format des sources.
 *
 * `hobbynextGames` est la table identifiant → nom de l'API ; vide, le jeu se
 * cherche dans le titre.
 */
export function extractHobbynextEvents({
  items,
  source,
  games,
  hobbynextGames,
  now,
}: {
  items: unknown[];
  source: Pick<EventSource, "url" | "gameAliases">;
  games: Pick<Game, "name">[];
  hobbynextGames: Map<number, string>;
  now: DateTime;
}): HobbynextExtraction {
  const warnings: string[] = [];
  const events: SourceEvent[] = [];
  const aliases = source.gameAliases;

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as HobbynextEvent;

    // Un événement privé n'a rien à faire sur un agenda public.
    if (typeof item.event_visibility === "string" && item.event_visibility !== "PUBLIC") continue;

    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) {
      warnings.push("événement sans nom, ignoré");
      continue;
    }

    const info = item.additional_info ?? {};
    const dates = resolveEventDates({
      start: hobbynextDate(item.event_start_date, item.event_type),
      end: hobbynextDate(info.event_end_date, item.event_type),
      now,
      trustYear: true,
    });

    if (!dates) {
      warnings.push(`date de début illisible, événement ignoré (« ${name} »)`);
      continue;
    }

    const hobbynextGame = typeof item.game === "number" ? hobbynextGames.get(item.game) : undefined;
    const gameName = resolveGame({ hobbynextGame, name, games, aliases, warnings });

    const externalId = typeof item.id === "number" || typeof item.id === "string" ? String(item.id) : undefined;

    events.push({
      name,
      ...dates,
      gameName,
      price: normalizeEventPrice(info.event_price),
      status: statusOf(info.remaining_seats),
      url: externalId ? `${HOBBYNEXT_EVENT_PAGE}${externalId}` : undefined,
      addedBy: "HOBBYNEXT",
      sourceUrl: source.url,
      externalId,
    });
  }

  return { events, warnings };
}

/**
 * Le jeu de la plateforme : le nom Hobbynext (ou son alias), à défaut un jeu
 * nommé dans le titre, à défaut le nom Hobbynext tel quel — signalé.
 */
function resolveGame({
  hobbynextGame,
  name,
  games,
  aliases,
  warnings,
}: {
  hobbynextGame: string | undefined;
  name: string;
  games: Pick<Game, "name">[];
  aliases: Record<string, string> | undefined;
  warnings: string[];
}): string {
  if (hobbynextGame) {
    const known = canonicalGameName(hobbynextGame, games, aliases);
    if (known) return known;
  }

  const inTitle = findGameInText(name, games, aliases);
  if (inTitle) return inTitle;

  if (!hobbynextGame || normalizeEventName(hobbynextGame) === HOBBYNEXT_OTHER_GAME) {
    warnings.push(`jeu non précisé par Hobbynext pour « ${name} », « Jeu non spécifié » écrit à la place`);
    return "Jeu non spécifié";
  }

  warnings.push(`jeu inconnu de la plateforme : « ${hobbynextGame} »`);
  return hobbynextGame;
}

/** Hobbynext ne dit « complet » que par les places restantes, et seulement pour certains événements. */
function statusOf(remainingSeats: unknown): EventStatus {
  return typeof remainingSeats === "number" && remainingSeats <= 0 ? "sold-out" : "available";
}
