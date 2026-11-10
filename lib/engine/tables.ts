import "server-only";

import { randomBytes, randomInt } from "node:crypto";

import { getDeckById } from "@/lib/db/decks";
import * as tablesDb from "@/lib/db/game-tables";
import { toEngineDeck } from "@/lib/engine/deck";
import { autoEngineDeck, engineCards, validateEngineDeck } from "@/lib/engine/server";
import { signTicket } from "@/lib/engine/tickets";
import {
  BOT_LEVELS,
  ENGINE_MODES,
  modePlayers,
  type BotLevel,
  type EngineConfig,
  type EngineDeckList,
  type EngineMode,
} from "@/lib/engine/types";
import type { GameTable, GameTableSeat, GameTableSummary } from "@/lib/types/GameTable";

/**
 * Les règles d'une table de jeu en ligne : qui la crée, qui s'assoit, qui la
 * lance, et le passage de relais au serveur de parties (dépôt joutes-engine).
 *
 * Le site ne joue pas la partie. Il tient la salle d'attente, envoie la
 * configuration au serveur de parties au lancement, signe un ticket par
 * personne et reçoit le résultat (`app/api/engine/result`).
 */

export type TableError =
  | "UNAUTHENTICATED"
  | "OFFLINE"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID"
  | "INVALID_DECK"
  | "FULL"
  | "ALREADY_SEATED"
  | "NOT_FULL"
  | "NOT_WAITING"
  | "SERVER";

export class TableFailure extends Error {
  constructor(
    readonly code: TableError,
    /** Les problèmes du deck, dans les mots du moteur. */
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

export type DeckChoice = { kind: "deck"; deckId: string } | { kind: "auto"; legend: string };

export type Seated = { userId: string; name: string };

type EngineServer = { url: string; publicUrl: string; secret: string; adminToken: string };

/** La configuration du serveur de parties, ou `null` si le jeu en ligne n'est pas branché. */
export function engineServer(): EngineServer | null {
  const url = process.env.JOUTES_ENGINE_URL?.replace(/\/+$/, "");
  const secret = process.env.JOUTES_ENGINE_SECRET;
  const adminToken = process.env.JOUTES_ENGINE_ADMIN_TOKEN;
  if (!url || !secret || !adminToken) return null;
  const publicUrl = (process.env.JOUTES_ENGINE_PUBLIC_URL ?? url).replace(/\/+$/, "");
  return { url, publicUrl, secret, adminToken };
}

function requireServer(): EngineServer {
  const server = engineServer();
  if (!server) throw new TableFailure("OFFLINE");
  return server;
}

/** Sans voyelles ni caractères ambigus : un code qu'on peut dicter, et qui n'écrit pas de mot. */
const CODE_ALPHABET = "bcdfghjkmnpqrstvwxz23456789";

function newTableId(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function isEngineMode(value: unknown): value is EngineMode {
  return ENGINE_MODES.includes(value as EngineMode);
}

export function isBotLevel(value: unknown): value is BotLevel {
  return BOT_LEVELS.includes(value as BotLevel);
}

/** Les légendes autour desquelles le moteur sait construire un deck. */
export function autoDeckLegends(): string[] {
  legends ??= [...engineCards().values()]
    .filter((card) => card.kind === "legend" && card.coverage !== "none")
    .map((card) => card.code)
    .filter((code) => autoEngineDeck(code, 1) !== null);
  return legends;
}

let legends: string[] | undefined;

/** Le deck d'un siège, vérifié par le moteur. */
export async function resolveDeck(
  choice: DeckChoice,
  userId: string | null,
  gameId: string,
): Promise<{ deck: EngineDeckList; deckName: string }> {
  if (choice.kind === "auto") {
    const deck = autoEngineDeck(choice.legend, randomInt(1, 2 ** 31));
    if (!deck) throw new TableFailure("INVALID_DECK");
    return { deck, deckName: "" };
  }

  const stored = await getDeckById(choice.deckId);
  if (!stored || stored.gameId !== gameId) throw new TableFailure("INVALID_DECK");
  if (stored.playerId !== userId && stored.visibility === "private") throw new TableFailure("INVALID_DECK");

  const { list, problems } = toEngineDeck(stored.cards);
  if (!list) {
    throw new TableFailure(
      "INVALID_DECK",
      problems.map((problem) => problem.kind),
    );
  }
  const refused = validateEngineDeck(list);
  if (refused.length > 0) throw new TableFailure("INVALID_DECK", refused);
  return { deck: list, deckName: stored.name };
}

export function summarize(table: GameTable): GameTableSummary {
  return {
    ...table,
    seats: table.seats.map((seat) => ({
      ...(seat.userId ? { userId: seat.userId } : {}),
      name: seat.name,
      ...(seat.bot ? { bot: seat.bot } : {}),
      deckName: seat.deckName,
      legend: seat.legend,
    })),
    players: modePlayers(table.mode),
  };
}

export async function createTable(
  host: Seated,
  mode: EngineMode,
  choice: DeckChoice,
  game: { id: string; slug: string },
): Promise<GameTable> {
  requireServer();
  const { deck, deckName } = await resolveDeck(choice, host.userId, game.id);
  const table: GameTable = {
    id: newTableId(),
    gameSlug: game.slug,
    mode,
    hostId: host.userId,
    status: "waiting",
    seats: [{ userId: host.userId, name: host.name, deckName, legend: deck.legend, deck }],
    createdAt: new Date().toISOString(),
  };
  await tablesDb.insertGameTable(table);
  return table;
}

async function waitingTable(id: string): Promise<GameTable> {
  const table = await tablesDb.getGameTable(id);
  if (!table) throw new TableFailure("NOT_FOUND");
  if (table.status !== "waiting") throw new TableFailure("NOT_WAITING");
  return table;
}

async function saveSeats(table: GameTable, seats: GameTableSeat[]): Promise<void> {
  // Quelqu'un d'autre a bougé entre la lecture et l'écriture : la table que
  // l'on a lue n'existe plus telle quelle. « Complète » est la cause courante.
  if (!(await tablesDb.replaceWaitingSeats(table.id, table.seats.length, seats))) {
    throw new TableFailure("FULL");
  }
}

export async function joinTable(player: Seated, id: string, choice: DeckChoice, gameId: string): Promise<void> {
  const table = await waitingTable(id);
  if (table.seats.some((seat) => seat.userId === player.userId)) throw new TableFailure("ALREADY_SEATED");
  if (table.seats.length >= modePlayers(table.mode)) throw new TableFailure("FULL");
  const { deck, deckName } = await resolveDeck(choice, player.userId, gameId);
  await saveSeats(table, [
    ...table.seats,
    { userId: player.userId, name: player.name, deckName, legend: deck.legend, deck },
  ]);
}

const BOT_NAMES = ["Poro", "Scuttle", "Krug", "Gromp"];

export async function addBot(userId: string, id: string, level: BotLevel): Promise<void> {
  const table = await waitingTable(id);
  if (table.hostId !== userId) throw new TableFailure("FORBIDDEN");
  if (table.seats.length >= modePlayers(table.mode)) throw new TableFailure("FULL");
  const legends = autoDeckLegends();
  const deck = autoEngineDeck(legends[randomInt(legends.length)], randomInt(1, 2 ** 31));
  if (!deck) throw new TableFailure("SERVER");
  const taken = new Set(table.seats.map((seat) => seat.name));
  const name = BOT_NAMES.find((candidate) => !taken.has(candidate)) ?? `Bot ${table.seats.length + 1}`;
  await saveSeats(table, [...table.seats, { name, bot: level, deckName: "", legend: deck.legend, deck }]);
}

/** Libère un siège : le sien, ou n'importe lequel pour l'hôte. L'hôte qui part annule la table. */
export async function leaveSeat(userId: string, id: string, seat: number): Promise<void> {
  const table = await waitingTable(id);
  const target = table.seats[seat];
  if (!target) throw new TableFailure("INVALID");
  const own = target.userId === userId;
  if (!own && table.hostId !== userId) throw new TableFailure("FORBIDDEN");
  if (own && table.hostId === userId) {
    await tablesDb.cancelGameTable(id);
    return;
  }
  await saveSeats(
    table,
    table.seats.filter((_, index) => index !== seat),
  );
}

export function engineConfig(table: GameTable): { config: EngineConfig; bots: (BotLevel | null)[] } {
  return {
    config: {
      mode: table.mode,
      players: table.seats.map((seat) => ({ name: seat.name, deck: seat.deck })),
    },
    bots: table.seats.map((seat) => seat.bot ?? null),
  };
}

export async function startTable(userId: string, id: string): Promise<void> {
  const server = requireServer();
  const table = await waitingTable(id);
  if (table.hostId !== userId) throw new TableFailure("FORBIDDEN");
  if (table.seats.length !== modePlayers(table.mode)) throw new TableFailure("NOT_FULL");

  // La table passe « en cours » avant l'appel : deux clics ne créent pas deux
  // parties, et un échec du serveur la remet en attente.
  if (!(await tablesDb.markGameTableStarted(id))) throw new TableFailure("NOT_WAITING");

  try {
    const response = await fetch(`${server.url}/games`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${server.adminToken}` },
      // La graine est tirée ici, sous 2^48 : le journal de la partie repasse
      // par du JavaScript, qui ne garde pas les entiers plus grands que 2^53.
      body: JSON.stringify({ id, seed: randomInt(1, 2 ** 48 - 1), ...engineConfig(table) }),
      signal: AbortSignal.timeout(10_000),
    });
    // 409 : la partie existe déjà sur le serveur, d'un lancement précédent
    // dont la réponse s'est perdue. Elle est bien lancée.
    if (!response.ok && response.status !== 409) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new TableFailure("SERVER", body?.error ? [body.error] : []);
    }
  } catch (error) {
    await tablesDb.revertGameTableStart(id);
    throw error instanceof TableFailure ? error : new TableFailure("SERVER");
  }
}

export type TableAccess = {
  /** Adresse WebSocket de la partie, ticket compris. */
  ws: string;
  seat: number | null;
};

const TICKET_SECONDS = 12 * 60 * 60;

/** L'entrée d'une personne à une partie lancée : son siège, ou une place de spectateur. */
export function tableAccess(table: GameTable, viewer: Seated | null): TableAccess | null {
  const server = engineServer();
  if (!server || table.status === "waiting" || table.status === "cancelled") return null;

  const seat = viewer ? table.seats.findIndex((candidate) => candidate.userId === viewer.userId) : -1;
  const ticket = signTicket(
    {
      game: table.id,
      role: seat >= 0 ? "player" : "spectator",
      seat: seat >= 0 ? seat : null,
      name: viewer?.name ?? "Spectateur",
      user: viewer?.userId ?? null,
      exp: Math.floor(Date.now() / 1000) + TICKET_SECONDS,
    },
    server.secret,
  );
  const base = server.publicUrl.replace(/^http/, "ws");
  return {
    ws: `${base}/games/${table.id}/ws?ticket=${encodeURIComponent(ticket)}`,
    seat: seat >= 0 ? seat : null,
  };
}
