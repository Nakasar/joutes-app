import { DateTime } from "luxon";
import type { EventSource } from "@/lib/types/Lair";
import type { Game } from "@/lib/types/Game";
import {
  canonicalGameName,
  findGameInText,
  normalizeEventName,
  resolveEventDates,
  type EventStatus,
  type SourceEvent,
} from "./source-events";

/**
 * Une source Riftbound : l'agenda que Riot tient pour les boutiques
 * (https://playriftbound.com/fr-FR/events/), lu par l'API GraphQL du site.
 *
 * Le lieu y est désigné par son identifiant d'organisateur — un UUID —, qui
 * n'apparaît nulle part dans l'interface : on le lit sur la fiche d'un de ses
 * événements (`GetCompeteTournamentForRiftboundPlayer` → `organizerId`), ce
 * que les formulaires savent faire à partir d'un lien.
 *
 * Trois particularités de cette API, que cette lecture règle :
 *
 * - **des requêtes enregistrées** : elle refuse toute requête libre et n'accepte
 *   que les opérations de son manifeste, désignées par leur empreinte
 *   (`RIFTBOUND_OPERATIONS`). Une empreinte que Riot retire fait échouer la
 *   lecture avec `PERSISTED_QUERY_NOT_IN_LIST` : c'est une panne de la source,
 *   qui ne retire rien, et la table est à mettre à jour depuis le manifeste du
 *   site (le module JavaScript au format `apollo-persisted-query-manifest`) ;
 * - **des en-têtes de client** : sans `apollographql-client-name` et
 *   `-version`, elle répond « No client headers set » ;
 * - **pas de liste par organisateur** : la seule liste publique est une
 *   recherche autour d'un point. On cherche donc autour de l'adresse du lieu,
 *   dans un rayon court, et on ne garde que ses événements à lui — une
 *   boutique voisine peut tomber dans le rayon.
 *
 * Les dates sont en vrai UTC. Tout est pur ici : `refresh-events` interroge
 * l'API et appelle `extractRiftboundEvents`.
 */

export const RIFTBOUND_API_URL = "https://playriftbound.com/api/gql";

/** La page publique d'un événement, où envoyer les joueurs. */
export const RIFTBOUND_EVENT_PAGE = "https://playriftbound.com/fr-FR/events/";

/** Les en-têtes sans lesquels l'API refuse de répondre. */
export const RIFTBOUND_CLIENT_HEADERS = {
  "apollographql-client-name": "Esports Web",
  "apollographql-client-version": "joutes",
} as const;

/**
 * Les opérations que l'API accepte, par leur empreinte dans le manifeste du
 * site. Elles ne se recalculent pas : c'est l'identifiant que le manifeste
 * leur donne, pas une empreinte de leur texte.
 */
export const RIFTBOUND_OPERATIONS = {
  /** La recherche d'événements autour d'un point. */
  search: {
    name: "CompeteTournamentSearch",
    hash: "acbcbba681a9c9a8063f792f7d665ba1eda81b19528b6af19e523f0c2061bec2",
  },
  /** La fiche d'un événement — qui porte son organisateur. */
  tournament: {
    name: "GetCompeteTournamentForRiftboundPlayer",
    hash: "174eb938c897c050771aa156c5066bef7b4c7f453ae5430ee54d33563ca65beb",
  },
  /** La fiche d'un organisateur — qui porte son adresse et ses coordonnées. */
  organizer: {
    name: "OrganizerSummary",
    hash: "9142e18241bb86a3b4c2692d899b31aaf61d11065ca8a259191aa9cc0a06ed57",
  },
} as const;

export type RiftboundOperation = keyof typeof RIFTBOUND_OPERATIONS;

/**
 * Le rayon de la recherche autour de l'adresse du lieu. L'API place un
 * événement à l'adresse de son organisateur — à vingt mètres près, constatés —
 * : un rayon court suffit, et limite ce que la recherche ramène des voisins.
 */
export const RIFTBOUND_SEARCH_RADIUS_METERS = 500;

/** Le nombre d'événements par page de recherche. */
export const RIFTBOUND_PAGE_SIZE = 50;

/** Le corps d'une requête enregistrée. */
export function riftboundRequestBody(operation: RiftboundOperation, variables: Record<string, unknown>): string {
  const { name, hash } = RIFTBOUND_OPERATIONS[operation];
  return JSON.stringify({
    operationName: name,
    variables,
    extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
  });
}

/**
 * Les variables d'une page de recherche autour d'un point, à partir de
 * `startDate` — ce que le site demande lui-même, filtre `rb` compris.
 */
export function riftboundSearchVariables({
  latitude,
  longitude,
  startDate,
  after,
}: {
  latitude: number;
  longitude: number;
  startDate: string;
  after?: string | null;
}): Record<string, unknown> {
  return {
    sport: "rb",
    first: RIFTBOUND_PAGE_SIZE,
    ...(after ? { after } : {}),
    filter: {
      rb: {
        coords: { latitude, longitude },
        distanceMeters: RIFTBOUND_SEARCH_RADIUS_METERS,
        startDate,
      },
    },
  };
}

/** Un identifiant d'organisateur : un UUID. */
export function isRiftboundOrganizerId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/** Un identifiant d'événement : un grand entier, gardé en texte. */
function isRiftboundEventId(value: string): boolean {
  return /^\d{6,25}$/.test(value.trim());
}

/**
 * L'adresse enregistrée comme `url` de la source. C'est la clé du
 * rapprochement — un événement sait de quelle source il vient —, et ce
 * qu'affiche le rapport. L'API n'a pas d'adresse par organisateur : celle-ci
 * n'est jamais demandée, elle nomme seulement la source.
 */
export function riftboundSourceUrl(organizerId: string): string {
  return `${RIFTBOUND_API_URL}?organizer=${encodeURIComponent(organizerId.trim().toLowerCase())}`;
}

/** L'identifiant d'organisateur que porte l'URL enregistrée d'une source, ou `null`. */
export function riftboundOrganizerFromSourceUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (`${url.origin}${url.pathname}` !== RIFTBOUND_API_URL) return null;
    const organizer = url.searchParams.get("organizer");
    return organizer && isRiftboundOrganizerId(organizer) ? organizer : null;
  } catch {
    return null;
  }
}

/** Les domaines des pages publiques de Riftbound : ce qu'un gérant colle. */
const RIFTBOUND_HOSTS = ["playriftbound.com"];

/** Une page publique de Riftbound — `https://playriftbound.com/fr-FR/events/117173669452027793`. */
export function isRiftboundPageUrl(value: string): boolean {
  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase();
    return RIFTBOUND_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/**
 * L'identifiant d'événement d'un lien Riftbound — « https://playriftbound.com/fr-FR/events/117173669452027793 » —,
 * ou de l'identifiant lui-même. `null` pour tout le reste, la liste des
 * événements comprise.
 */
export function parseRiftboundEventRef(value: string): string | null {
  const text = value.trim();
  if (isRiftboundEventId(text)) return text;

  try {
    const url = new URL(text);
    const match = /\/events\/(\d{6,25})\/?$/.exec(url.pathname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Une réponse GraphQL : ses données, ou l'erreur qui dit pourquoi il n'y en a
 * pas. Une réponse qui porte des données **et** des erreurs garde ses
 * données : l'API y signale des champs secondaires.
 */
export function riftboundData(response: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; error: string; code?: string } {
  const { data, errors } = (response ?? {}) as { data?: unknown; errors?: unknown };
  const first = Array.isArray(errors) ? (errors[0] as { message?: unknown; extensions?: { code?: unknown; classification?: unknown } } | undefined) : undefined;
  const code = typeof first?.extensions?.code === "string"
    ? first.extensions.code
    : typeof first?.extensions?.classification === "string"
      ? first.extensions.classification
      : undefined;

  if (data && typeof data === "object") {
    return { ok: true, data: data as Record<string, unknown> };
  }

  if (code === "PERSISTED_QUERY_NOT_IN_LIST" || code === "PERSISTED_QUERY_NOT_FOUND") {
    return { ok: false, error: "Riftbound ne reconnaît plus la requête de Joutes : la lecture est à mettre à jour", code };
  }

  const message = typeof first?.message === "string" && first.message.trim() ? first.message.trim() : "réponse sans données";
  return { ok: false, error: `Riftbound : ${message}`, ...(code ? { code } : {}) };
}

/** Ce que la fiche d'un organisateur donne : de quoi chercher autour de lui. */
export type RiftboundOrganizer = {
  id: string;
  name?: string;
  address?: string;
  latitude: number;
  longitude: number;
};

/** Lit la fiche d'un organisateur (`OrganizerSummary`), ou `null` sans coordonnées. */
export function readRiftboundOrganizer(data: Record<string, unknown>): RiftboundOrganizer | null {
  const organizer = data.organizerSummary as {
    id?: unknown;
    name?: unknown;
    physicalAddress?: { formattedAddress?: unknown; latitude?: unknown; longitude?: unknown } | null;
  } | null | undefined;
  if (!organizer || typeof organizer.id !== "string") return null;

  const { latitude, longitude, formattedAddress } = organizer.physicalAddress ?? {};
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    id: organizer.id,
    ...(typeof organizer.name === "string" && organizer.name.trim() ? { name: organizer.name.trim() } : {}),
    ...(typeof formattedAddress === "string" && formattedAddress.trim() ? { address: formattedAddress.trim() } : {}),
    latitude,
    longitude,
  };
}

/**
 * Ce que la recherche de l'organisateur d'un événement a donné.
 *
 * - `NOT_FOUND` : Riftbound ne connaît pas l'événement ;
 * - `FAILED` : Riftbound n'a pas répondu comme attendu.
 */
export type RiftboundOrganizerLookup =
  | { ok: true; organizerId: string; eventName?: string; organizerName?: string }
  | { ok: false; reason: "NOT_FOUND" | "FAILED"; message?: string };

/** Lit l'organisateur sur la fiche d'un événement (`competeTournaments`). */
export function readRiftboundTournamentOrganizer(data: Record<string, unknown>): RiftboundOrganizerLookup {
  const tournaments = data.competeTournaments;
  const tournament = (Array.isArray(tournaments) ? tournaments[0] : null) as { organizerId?: unknown; name?: unknown } | null;
  if (!tournament) return { ok: false, reason: "NOT_FOUND" };

  const organizerId = typeof tournament.organizerId === "string" ? tournament.organizerId.trim() : "";
  if (!isRiftboundOrganizerId(organizerId)) return { ok: false, reason: "NOT_FOUND" };

  return {
    ok: true,
    organizerId: organizerId.toLowerCase(),
    ...(typeof tournament.name === "string" && tournament.name.trim() ? { eventName: tournament.name.trim() } : {}),
  };
}

/** Une page de recherche : ses résultats, et le curseur de la suivante. */
export function readRiftboundSearchPage(data: Record<string, unknown>): { nodes: unknown[]; next: string | null } | null {
  const search = data.competeTournamentSearch as {
    edges?: unknown;
    pageInfo?: { hasNextPage?: unknown; endCursor?: unknown } | null;
  } | null | undefined;
  if (!search || !Array.isArray(search.edges)) return null;

  const nodes = search.edges.map((edge) => (edge as { node?: unknown } | null)?.node).filter(Boolean);
  const { hasNextPage, endCursor } = search.pageInfo ?? {};
  return { nodes, next: hasNextPage === true && typeof endCursor === "string" && endCursor ? endCursor : null };
}

type RiftboundSearchResult = {
  organizer?: { id?: unknown } | null;
  tournament?: {
    id?: unknown;
    name?: unknown;
    startsAt?: unknown;
    pricing?: unknown;
    entryFee?: { currency?: unknown; minorUnits?: unknown } | null;
    registrantCounts?: { status?: unknown; count?: unknown }[] | null;
    config?: { participantCapacity?: unknown } | null;
  } | null;
};

export type RiftboundExtraction = {
  events: SourceEvent[];
  warnings: string[];
};

/** Le nom du jeu sur la plateforme : Riftbound, sous le nom qu'elle lui donne. */
const RIFTBOUND_GAME = "Riftbound";

/**
 * Les événements d'une recherche Riftbound, au format des sources : ceux de
 * l'organisateur seulement.
 */
export function extractRiftboundEvents({
  nodes,
  organizerId,
  source,
  games,
  now,
}: {
  nodes: unknown[];
  organizerId: string;
  source: Pick<EventSource, "url" | "gameAliases">;
  games: Pick<Game, "name">[];
  now: DateTime;
}): RiftboundExtraction {
  const warnings: string[] = [];
  const events: SourceEvent[] = [];
  const seen = new Set<string>();
  const wanted = organizerId.trim().toLowerCase();
  const gameName = resolveGame(games, source.gameAliases, warnings);

  for (const raw of nodes) {
    if (!raw || typeof raw !== "object") continue;
    const result = raw as RiftboundSearchResult;

    // Le rayon ramène aussi les boutiques voisines.
    const owner = typeof result.organizer?.id === "string" ? result.organizer.id.toLowerCase() : "";
    if (owner !== wanted) continue;

    const tournament = result.tournament;
    if (!tournament) continue;

    const externalId = typeof tournament.id === "string" || typeof tournament.id === "number" ? String(tournament.id) : undefined;
    if (externalId && seen.has(externalId)) continue;
    if (externalId) seen.add(externalId);

    const name = typeof tournament.name === "string" ? tournament.name.trim() : "";
    if (!name) {
      warnings.push("événement sans nom, ignoré");
      continue;
    }

    const dates = resolveEventDates({ start: tournament.startsAt, end: null, now, trustYear: true });
    if (!dates) {
      warnings.push(`date de début illisible, événement ignoré (« ${name} »)`);
      continue;
    }

    const price = priceOf(tournament.pricing, tournament.entryFee);
    if (price === null) {
      warnings.push(`droit d'entrée dans une autre devise que l'euro, prix laissé vide (« ${name} »)`);
    }

    events.push({
      name,
      ...dates,
      gameName,
      ...(typeof price === "number" ? { price } : {}),
      status: statusOf(tournament.registrantCounts, tournament.config?.participantCapacity),
      url: externalId ? `${RIFTBOUND_EVENT_PAGE}${externalId}` : undefined,
      addedBy: "RIFTBOUND",
      sourceUrl: source.url,
      externalId,
    });
  }

  return { events, warnings };
}

/**
 * Le jeu de la plateforme : « Riftbound » (ou son alias), à défaut le premier
 * jeu dont le nom le contient — « Riftbound: League of Legends TCG ».
 */
function resolveGame(
  games: Pick<Game, "name">[],
  aliases: Record<string, string> | undefined,
  warnings: string[],
): string {
  const known = canonicalGameName(RIFTBOUND_GAME, games, aliases) ?? findGameInText(RIFTBOUND_GAME, games, aliases);
  if (known) return known;

  const wanted = normalizeEventName(RIFTBOUND_GAME);
  const containing = games.find((game) => normalizeEventName(game.name).includes(wanted));
  if (containing) return containing.name;

  warnings.push(`jeu inconnu de la plateforme : « ${RIFTBOUND_GAME} »`);
  return RIFTBOUND_GAME;
}

/**
 * Gratuit, ou le droit d'entrée en centimes ramené en euros. Joutes n'écrit
 * qu'un nombre, lu comme des euros : un droit dans une autre devise — un lieu
 * suisse, britannique — rend `null`, plutôt qu'un prix faux.
 */
function priceOf(pricing: unknown, entryFee: { currency?: unknown; minorUnits?: unknown } | null | undefined): number | null | undefined {
  const minorUnits = entryFee?.minorUnits;
  if (typeof minorUnits === "number" && Number.isFinite(minorUnits) && minorUnits >= 0) {
    return entryFee?.currency === "EUR" ? minorUnits / 100 : null;
  }
  return pricing === "FREE" ? 0 : undefined;
}

/** Complet quand les inscrits atteignent la capacité ; la liste d'attente ne compte pas. */
function statusOf(counts: unknown, capacity: unknown): EventStatus {
  if (typeof capacity !== "number" || capacity <= 0 || !Array.isArray(counts)) return "available";
  const registered = (counts as { status?: unknown; count?: unknown }[])
    .filter((entry) => entry?.status === "REGISTERED")
    .reduce((total, entry) => total + (typeof entry.count === "number" ? entry.count : 0), 0);
  return registered >= capacity ? "sold-out" : "available";
}
