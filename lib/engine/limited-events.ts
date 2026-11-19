import "server-only";

import { randomBytes, randomInt } from "node:crypto";

import { DateTime } from "luxon";

import * as eventsDb from "@/lib/db/limited-events";
import {
  isLimitedGame,
  LIMITED_KINDS,
  limitedRules,
  type LimitedGameKey,
  type LimitedKind,
  type LimitedRules,
  type LimitedSettings,
} from "@/lib/engine/limited";
import { boosterSetCodes } from "@/lib/engine/server";
import { swuLimitedRules } from "@/lib/engine/swu/limited";
import { swuBoosterSetCodes } from "@/lib/engine/swu/server";
import { engineServer, TableFailure, type Seated, type TableGame } from "@/lib/engine/tables";
import { signTicket } from "@/lib/engine/tickets";
import type { BotLevel } from "@/lib/engine/types";
import type { LimitedEvent, LimitedEventSummary, LimitedTimers } from "@/lib/types/LimitedEvent";

/**
 * Les règles d'un scellé ou d'un draft en ligne : qui l'ouvre, qui s'assoit,
 * qui le lance, et le passage de relais au serveur de parties (dépôt
 * joutes-engine, `joutes-server/src/limited.rs`).
 *
 * Le site ne voit aucune carte : il tient la salle d'attente, envoie les
 * réglages au lancement et signe un ticket par personne. Le serveur de parties
 * ouvre les boosters, tient les délais et ouvre une table par match.
 */

/** Ce que le site vérifie des réglages d'un jeu avant de les garder : ses nombres et ses extensions. */
const GAMES: Record<LimitedGameKey, { rules: (kind: LimitedKind) => LimitedRules; sets: () => string[]; bots: string[] }> = {
  riftbound: {
    rules: limitedRules,
    sets: boosterSetCodes,
    bots: ["Poro", "Scuttle", "Krug", "Gromp", "Raptor", "Herald", "Baron"],
  },
  swu: {
    rules: swuLimitedRules,
    sets: swuBoosterSetCodes,
    bots: ["Astro", "Protocole", "Sonde", "Vigie", "Mécano", "Éclaireur", "Navigateur"],
  },
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/** Les délais par défaut, en secondes, et leurs bornes (0 : pas de limite). */
export const DEFAULT_TIMERS: LimitedTimers = { pick: 60, build: 20 * 60 };
const PICK_RANGE = [15, 10 * 60] as const;
const BUILD_RANGE = [5 * 60, 2 * 60 * 60] as const;

export type LimitedEventOptions = { kind: LimitedKind; packs: string[]; players: number; timers: LimitedTimers };

const CODE_ALPHABET = "bcdfghjkmnpqrstvwxz23456789";

function newEventId(): string {
  return Array.from(randomBytes(8), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function delay(value: unknown, [min, max]: readonly [number, number]): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new TableFailure("INVALID");
  if (value !== 0 && (value < min || value > max)) throw new TableFailure("INVALID");
  return value;
}

/** Les réglages reçus d'un navigateur, vérifiés. */
export function parseLimitedOptions(input: unknown, slug: string): LimitedEventOptions {
  if (!isLimitedGame(slug)) throw new TableFailure("INVALID");
  const game = GAMES[slug];
  const value = input as { kind?: unknown; packs?: unknown; players?: unknown; timers?: unknown } | null;
  const kind = value?.kind;
  if (!LIMITED_KINDS.includes(kind as LimitedKind)) throw new TableFailure("INVALID");
  const rules = game.rules(kind as LimitedKind);
  const sets = game.sets();
  const packs = value?.packs;
  if (!Array.isArray(packs) || packs.length !== rules.boosters || !packs.every((code) => sets.includes(code))) {
    throw new TableFailure("INVALID");
  }
  const players = value?.players;
  if (typeof players !== "number" || !Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS) {
    throw new TableFailure("INVALID");
  }
  const timers = (value?.timers ?? DEFAULT_TIMERS) as { pick?: unknown; build?: unknown };
  return {
    kind: kind as LimitedKind,
    packs: packs as string[],
    players,
    timers: { pick: delay(timers.pick, PICK_RANGE), build: delay(timers.build, BUILD_RANGE) },
  };
}

export function summarizeLimitedEvent(event: LimitedEvent): LimitedEventSummary {
  const { id, gameSlug, kind, packs, players, timers, status, createdAt, startedAt, hostId } = event;
  return {
    id,
    gameSlug,
    kind,
    packs,
    players,
    timers,
    status,
    createdAt,
    ...(startedAt ? { startedAt } : {}),
    seats: event.seats.map((seat) => ({
      name: seat.name,
      ...(seat.bot ? { bot: seat.bot } : {}),
      host: seat.userId === hostId,
    })),
  };
}

export async function createLimitedEvent(
  host: Seated,
  options: LimitedEventOptions,
  game: TableGame,
): Promise<LimitedEvent> {
  if (!engineServer()) throw new TableFailure("OFFLINE");
  if (!isLimitedGame(game.slug)) throw new TableFailure("INVALID");
  // Un seul évènement en attente par hôte et par jeu : une salle ouverte à un
  // autre jeu reste ouverte.
  await eventsDb.cancelWaitingLimitedEventsOf(host.userId, game.slug);
  for (let attempt = 0; attempt < 3; attempt++) {
    const event: LimitedEvent = {
      id: newEventId(),
      gameSlug: game.slug,
      ...options,
      hostId: host.userId,
      status: "waiting",
      seats: [{ userId: host.userId, name: host.name }],
      createdAt: DateTime.utc().toISO(),
    };
    if (await eventsDb.insertLimitedEvent(event)) return event;
  }
  throw new TableFailure("SERVER");
}

async function waitingEvent(id: string, game: TableGame): Promise<LimitedEvent> {
  const event = await eventsDb.getLimitedEvent(id);
  if (!event || event.gameSlug !== game.slug) throw new TableFailure("NOT_FOUND");
  if (event.status !== "waiting") throw new TableFailure("NOT_WAITING");
  return event;
}

/**
 * Deux personnes du même nom porteraient le même nom à la table : le serveur
 * de parties les distingue par leur siège, mais pas les joueurs.
 */
function freeName(event: LimitedEvent, wanted: string): string {
  const taken = new Set(event.seats.map((seat) => seat.name));
  if (!taken.has(wanted)) return wanted;
  for (let number = 2; ; number++) {
    const candidate = `${wanted.slice(0, 36)} ${number}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function joinLimitedEvent(player: Seated, id: string, game: TableGame): Promise<void> {
  const event = await waitingEvent(id, game);
  if (event.seats.some((seat) => seat.userId === player.userId)) throw new TableFailure("ALREADY_SEATED");
  if (event.seats.length >= event.players) throw new TableFailure("FULL");
  const seat = { userId: player.userId, name: freeName(event, player.name) };
  if (!(await eventsDb.addLimitedEventSeat(id, event.players, seat))) throw new TableFailure("FULL");
}

export async function addLimitedBot(userId: string, id: string, level: BotLevel, game: TableGame): Promise<void> {
  const event = await waitingEvent(id, game);
  if (event.hostId !== userId) throw new TableFailure("FORBIDDEN");
  if (event.seats.length >= event.players) throw new TableFailure("FULL");
  const taken = new Set(event.seats.map((seat) => seat.name));
  const names = isLimitedGame(game.slug) ? GAMES[game.slug].bots : [];
  const name = names.find((candidate) => !taken.has(candidate)) ?? freeName(event, "Bot");
  if (!(await eventsDb.addLimitedEventSeat(id, event.players, { name, bot: level }))) throw new TableFailure("FULL");
}

/**
 * Libère un siège : le sien, ou n'importe lequel pour l'hôte. L'hôte qui part
 * annule l'évènement. `name` est le nom que l'appelant voyait à ce siège.
 */
export async function leaveLimitedSeat(
  userId: string,
  id: string,
  seat: number,
  name: string,
  game: TableGame,
): Promise<void> {
  const event = await waitingEvent(id, game);
  const target = event.seats[seat];
  if (!target || target.name !== name) throw new TableFailure("INVALID");
  const own = target.userId === userId;
  if (!own && event.hostId !== userId) throw new TableFailure("FORBIDDEN");
  if (own && event.hostId === userId) {
    await eventsDb.cancelLimitedEvent(id);
    return;
  }
  const removed = await eventsDb.removeLimitedEventSeat(
    id,
    target.userId ? { userId: target.userId } : { bot: target.name },
  );
  if (!removed) throw new TableFailure("NOT_WAITING");
}

/** Ce que le serveur de parties reçoit au lancement. */
export function limitedSettings(event: LimitedEvent): LimitedSettings {
  return {
    kind: event.kind,
    packs: event.packs,
    players: event.seats.map((seat) => ({ name: seat.name, bot: seat.bot ?? null })),
  };
}

/** Lance l'évènement avec les joueurs assis : deux au moins, les places libres restent vides. */
export async function startLimitedEvent(userId: string, id: string, game: TableGame): Promise<void> {
  const server = engineServer();
  if (!server) throw new TableFailure("OFFLINE");
  const waiting = await waitingEvent(id, game);
  if (waiting.hostId !== userId) throw new TableFailure("FORBIDDEN");
  if (waiting.seats.length < MIN_PLAYERS) throw new TableFailure("NOT_FULL");

  // Même verrou que pour une table : l'évènement passe « en cours » avant
  // l'appel, et les sièges envoyés sont ceux du document ainsi verrouillé.
  const engineId = `${id}-${randomBytes(4).toString("hex")}`;
  const event = await eventsDb.claimLimitedEventStart(id, userId, engineId);
  if (!event) throw new TableFailure("NOT_WAITING");

  let response: Response;
  try {
    response = await fetch(`${server.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${server.adminToken}` },
      body: JSON.stringify({
        id: engineId,
        game: event.gameSlug,
        seed: randomInt(1, 2 ** 48 - 1),
        settings: limitedSettings(event),
        timers: event.timers,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Pas de réponse (délai dépassé, coupure) : le serveur a peut-être créé
    // l'évènement. On le lui demande avant de rouvrir la salle, sinon un
    // évènement orphelin continuerait seul pendant qu'un second est lancé.
    const known = await engineEventStatus(server, engineId);
    if (known === "unknown") {
      // Toujours injoignable : la salle reste « en cours », et la
      // réconciliation la rouvrira si le serveur ne connaît pas l'évènement.
      throw new TableFailure("SERVER");
    }
    if (known === "missing") {
      await eventsDb.revertLimitedEventStart(id, engineId);
      throw new TableFailure("SERVER");
    }
    return;
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    await eventsDb.revertLimitedEventStart(id, engineId);
    throw new TableFailure("SERVER", body?.error ? [body.error] : []);
  }
}

type EngineEventStatus = { phase: string } | "missing" | "unknown";

/** L'état d'un évènement sur le serveur de parties : sa phase, inconnu (404) ou injoignable. */
async function engineEventStatus(
  server: NonNullable<ReturnType<typeof engineServer>>,
  engineId: string,
): Promise<EngineEventStatus> {
  try {
    const response = await fetch(`${server.url}/events/${engineId}`, {
      headers: { authorization: `Bearer ${server.adminToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) return "missing";
    if (!response.ok) return "unknown";
    const body = (await response.json().catch(() => null)) as { phase?: unknown } | null;
    return typeof body?.phase === "string" ? { phase: body.phase } : "unknown";
  } catch {
    return "unknown";
  }
}

const RECONCILE_AFTER_SECONDS = 60;

/**
 * Un évènement « en cours » que le serveur de parties ne connaît plus est
 * abandonné ; celui dont il a joué tous les matchs est terminé. Serveur
 * injoignable : rien ne change.
 */
export async function reconcileLimitedEvent(event: LimitedEvent): Promise<LimitedEvent> {
  const server = engineServer();
  if (!server || event.status !== "playing" || !event.engineId || !event.startedAt) return event;
  if (DateTime.fromISO(event.startedAt).diffNow("seconds").seconds > -RECONCILE_AFTER_SECONDS) return event;
  const known = await engineEventStatus(server, event.engineId);
  if (known === "missing" && (await eventsDb.abandonLimitedEvent(event.id, event.engineId))) {
    return { ...event, status: "cancelled" };
  }
  if (typeof known === "object" && known.phase === "done" && (await eventsDb.finishLimitedEvent(event.id, event.engineId))) {
    return { ...event, status: "finished" };
  }
  return event;
}

export type LimitedAccess = {
  /** Adresse WebSocket de l'évènement, ticket compris. */
  ws: string;
  /** Adresse WebSocket du serveur de parties : les tables des matchs s'y ouvrent. */
  server: string;
  /** L'évènement sur le serveur de parties : il change si l'évènement est relancé. */
  event: string;
  seat: number | null;
};

const TICKET_SECONDS = 12 * 60 * 60;

/** L'entrée d'une personne à un évènement lancé : son siège, ou une place de spectateur. */
export function limitedAccess(event: LimitedEvent, viewer: Seated | null): LimitedAccess | null {
  const server = engineServer();
  // Un évènement terminé reste ouvert à la lecture : son bilan vient du serveur de parties.
  if (!server || (event.status !== "playing" && event.status !== "finished") || !event.engineId) return null;
  const seat = viewer ? event.seats.findIndex((candidate) => candidate.userId === viewer.userId) : -1;
  const ticket = signTicket(
    {
      game: `event:${event.engineId}`,
      role: seat >= 0 ? "player" : "spectator",
      seat: seat >= 0 ? seat : null,
      name: seat >= 0 ? event.seats[seat].name : (viewer?.name ?? "Spectateur"),
      user: viewer?.userId ?? null,
      exp: Math.floor(DateTime.utc().toSeconds()) + TICKET_SECONDS,
    },
    server.secret,
  );
  const base = server.publicUrl.replace(/^http/, "ws");
  return {
    ws: `${base}/events/${event.engineId}/ws?ticket=${encodeURIComponent(ticket)}`,
    server: base,
    event: event.engineId,
    seat: seat >= 0 ? seat : null,
  };
}
