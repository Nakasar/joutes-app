import "server-only";

import { randomBytes, randomInt } from "node:crypto";

import { DateTime } from "luxon";

import { getDeckById } from "@/lib/db/decks";
import { readDeckAccess } from "@/lib/decks/read-access";
import * as tablesDb from "@/lib/db/game-tables";
import { engineDeckOf } from "@/lib/engine/playable-deck";
import { autoEngineDeck, engineCards } from "@/lib/engine/server";
import { engineGameId, parseEngineResult, type EngineResult } from "@/lib/engine/results";
import { swuDeckOf } from "@/lib/engine/swu/lobby-decks";
import { autoSwuDeck, swuAutoLeaders } from "@/lib/engine/swu/server";
import type { SwuConfig, SwuDeckList } from "@/lib/engine/swu/types";
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
  /** Réservé à un abonnement (Joutes Pro ou Joutes Expert) que la personne n'a pas. */
  | "SUBSCRIPTION"
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

/** Le deck d'une IA : un choix de joueur, ou une légende tirée au sort à chaque partie. */
export type BotDeckChoice = DeckChoice | { kind: "random" };

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

/** Le jeu d'une table : son identifiant Joutes et son slug (« riftbound », « swu »). */
export type TableGame = { id: string; slug: string };

export const SWU_SLUG = "swu";

/** Un deck enregistré que le demandeur a le droit de lire, pour ce jeu. */
export async function readableDeck(deckId: string, userId: string | null, gameId: string) {
  const stored = await getDeckById(deckId);
  if (!stored || stored.gameId !== gameId) throw new TableFailure("INVALID_DECK");
  // Un deck privé s'ouvre à son auteur et aux membres d'un groupe où il est partagé.
  if (!(await readDeckAccess(stored, userId))) throw new TableFailure("INVALID_DECK");
  return stored;
}

/** Le deck Riftbound d'un siège, vérifié par le moteur. */
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

  const stored = await readableDeck(choice.deckId, userId, gameId);
  const { list, problems } = engineDeckOf(stored);
  if (!list) throw new TableFailure("INVALID_DECK", problems);
  return { deck: list, deckName: stored.name };
}

/** Le deck Star Wars: Unlimited d'un siège, vérifié par le moteur. `legend` nomme alors un leader. */
export async function resolveSwuDeck(
  choice: DeckChoice,
  userId: string | null,
  gameId: string,
): Promise<{ deck: SwuDeckList; deckName: string }> {
  if (choice.kind === "auto") {
    const deck = autoSwuDeck(choice.legend, randomInt(1, 2 ** 31));
    if (!deck) throw new TableFailure("INVALID_DECK");
    return { deck, deckName: "" };
  }

  const stored = await readableDeck(choice.deckId, userId, gameId);
  const { list, problems } = swuDeckOf(stored);
  if (!list) throw new TableFailure("INVALID_DECK", problems);
  return { deck: list, deckName: stored.name };
}

type SeatDeck = Pick<GameTableSeat, "deck" | "deckName" | "legend">;

/** Le deck d'un siège, dans le jeu de la table. `legend` est la carte montrée en salle d'attente. */
async function seatDeck(choice: DeckChoice, userId: string | null, game: TableGame): Promise<SeatDeck> {
  if (game.slug === SWU_SLUG) {
    const { deck, deckName } = await resolveSwuDeck(choice, userId, game.id);
    return { deck, deckName, legend: deck.leader };
  }
  const { deck, deckName } = await resolveDeck(choice, userId, game.id);
  return { deck, deckName, legend: deck.legend };
}

/** Le deck tiré au sort d'une IA ajoutée à la table. */
function botDeck(slug: string): SeatDeck | null {
  if (slug === SWU_SLUG) {
    const leaders = swuAutoLeaders();
    const deck = autoSwuDeck(leaders[randomInt(leaders.length)], randomInt(1, 2 ** 31));
    return deck ? { deck, deckName: "", legend: deck.leader } : null;
  }
  const legends = autoDeckLegends();
  const deck = autoEngineDeck(legends[randomInt(legends.length)], randomInt(1, 2 ** 31));
  return deck ? { deck, deckName: "", legend: deck.legend } : null;
}

export function summarize(table: GameTable): GameTableSummary {
  const { id, gameSlug, mode, status, createdAt, startedAt, finishedAt, result, hostId } = table;
  return {
    id,
    gameSlug,
    mode,
    status,
    createdAt,
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    ...(result ? { result } : {}),
    seats: table.seats.map((seat) => ({
      name: seat.name,
      ...(seat.bot ? { bot: seat.bot } : {}),
      deckName: seat.deckName,
      legend: seat.legend,
      host: seat.userId === hostId,
    })),
    players: modePlayers(table.mode),
  };
}

export async function createTable(
  host: Seated,
  mode: EngineMode,
  choice: DeckChoice,
  game: TableGame,
): Promise<GameTable> {
  requireServer();
  // Star Wars: Unlimited ne se joue qu'à deux (format Premier).
  if (game.slug === SWU_SLUG && mode !== "duel") throw new TableFailure("INVALID");
  const deck = await seatDeck(choice, host.userId, game);
  // Une seule table en attente par hôte : sans cela, rien ne borne le nombre
  // de tables qu'un compte peut ouvrir.
  await tablesDb.cancelWaitingGameTablesOf(host.userId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const table: GameTable = {
      id: newTableId(),
      gameSlug: game.slug,
      mode,
      hostId: host.userId,
      status: "waiting",
      seats: [{ userId: host.userId, name: host.name, ...deck }],
      createdAt: DateTime.utc().toISO(),
    };
    if (await tablesDb.insertGameTable(table)) return table;
  }
  throw new TableFailure("SERVER");
}

async function waitingTable(id: string): Promise<GameTable> {
  const table = await tablesDb.getGameTable(id);
  if (!table) throw new TableFailure("NOT_FOUND");
  if (table.status !== "waiting") throw new TableFailure("NOT_WAITING");
  return table;
}

/**
 * Les lectures ci-dessous servent à répondre précisément (« complète », « déjà
 * assis ») ; ce sont les écritures de `lib/db/game-tables.ts`, conditionnelles,
 * qui garantissent l'état de la table quand deux personnes agissent ensemble.
 */
export async function joinTable(player: Seated, id: string, choice: DeckChoice, game: TableGame): Promise<void> {
  const table = await waitingTable(id);
  // Une table ne se rejoint que depuis la page de son jeu : le deck est celui de ce jeu.
  if (table.gameSlug !== game.slug) throw new TableFailure("NOT_FOUND");
  if (table.seats.some((seat) => seat.userId === player.userId)) throw new TableFailure("ALREADY_SEATED");
  if (table.seats.length >= modePlayers(table.mode)) throw new TableFailure("FULL");
  const deck = await seatDeck(choice, player.userId, game);
  const seat = { userId: player.userId, name: player.name, ...deck };
  if (!(await tablesDb.addGameTableSeat(id, modePlayers(table.mode), seat))) throw new TableFailure("FULL");
}

const BOT_NAMES = ["Poro", "Scuttle", "Krug", "Gromp"];
const SWU_BOT_NAMES = ["R2-D2", "C-3PO"];

export async function addBot(userId: string, id: string, level: BotLevel): Promise<void> {
  const table = await waitingTable(id);
  if (table.hostId !== userId) throw new TableFailure("FORBIDDEN");
  if (table.seats.length >= modePlayers(table.mode)) throw new TableFailure("FULL");
  const deck = botDeck(table.gameSlug);
  if (!deck) throw new TableFailure("SERVER");
  const taken = new Set(table.seats.map((seat) => seat.name));
  const names = table.gameSlug === SWU_SLUG ? SWU_BOT_NAMES : BOT_NAMES;
  const name = names.find((candidate) => !taken.has(candidate)) ?? `Bot ${table.seats.length + 1}`;
  const seat = { name, bot: level, ...deck };
  if (!(await tablesDb.addGameTableSeat(id, modePlayers(table.mode), seat))) throw new TableFailure("FULL");
}

/**
 * Libère un siège : le sien, ou n'importe lequel pour l'hôte. L'hôte qui part
 * annule la table. `name` est le nom que l'appelant voyait à ce siège : si la
 * salle a bougé depuis, le siège n'est plus celui qu'il visait et rien n'est
 * retiré.
 */
export async function leaveSeat(userId: string, id: string, seat: number, name: string): Promise<void> {
  const table = await waitingTable(id);
  const target = table.seats[seat];
  if (!target || target.name !== name) throw new TableFailure("INVALID");
  const own = target.userId === userId;
  if (!own && table.hostId !== userId) throw new TableFailure("FORBIDDEN");
  if (own && table.hostId === userId) {
    await tablesDb.cancelGameTable(id);
    return;
  }
  const removed = await tablesDb.removeGameTableSeat(
    id,
    target.userId ? { userId: target.userId } : { bot: target.name },
  );
  if (!removed) throw new TableFailure("NOT_WAITING");
}

/**
 * Ce que le serveur de parties reçoit au lancement. `game` n'est nommé que pour
 * Star Wars: Unlimited : sans lui, le serveur joue à Riftbound.
 */
export function engineConfig(
  table: GameTable,
): { game?: string; config: EngineConfig | SwuConfig; bots: (BotLevel | null)[] } {
  const bots = table.seats.map((seat) => seat.bot ?? null);
  if (table.gameSlug === SWU_SLUG) {
    return {
      game: SWU_SLUG,
      config: { players: table.seats.map((seat) => ({ name: seat.name, deck: seat.deck as SwuDeckList })) },
      bots,
    };
  }
  return {
    config: {
      mode: table.mode,
      players: table.seats.map((seat) => ({
        name: seat.name,
        deck: seat.deck as EngineDeckList,
        ...(seat.bot ? {} : { manual_pay: true }),
      })),
    },
    bots,
  };
}

export async function startTable(userId: string, id: string): Promise<void> {
  const server = requireServer();
  const waiting = await waitingTable(id);
  if (waiting.hostId !== userId) throw new TableFailure("FORBIDDEN");
  const players = modePlayers(waiting.mode);
  if (waiting.seats.length !== players) throw new TableFailure("NOT_FULL");

  // La table passe « en cours » avant l'appel : deux clics ne créent pas deux
  // parties. La configuration envoyée est celle du document ainsi verrouillé,
  // pas celle lue plus haut : un départ entre les deux fait échouer le
  // lancement au lieu de lancer une partie avec un siège fantôme.
  const engineId = `${id}-${randomBytes(4).toString("hex")}`;
  const table = await tablesDb.claimGameTableStart(id, userId, players, engineId);
  if (!table) throw new TableFailure("NOT_WAITING");

  try {
    const response = await fetch(`${server.url}/games`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${server.adminToken}` },
      // La graine est tirée ici, sous 2^48 : le journal de la partie repasse
      // par du JavaScript, qui ne garde pas les entiers plus grands que 2^53.
      body: JSON.stringify({ id: engineId, seed: randomInt(1, 2 ** 48 - 1), ...engineConfig(table) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new TableFailure("SERVER", body?.error ? [body.error] : []);
    }
  } catch (error) {
    // Si le serveur a créé la partie sans que sa réponse arrive, elle reste
    // orpheline : le prochain lancement en crée une autre, sous un autre nom.
    await tablesDb.revertGameTableStart(id, engineId);
    throw error instanceof TableFailure ? error : new TableFailure("SERVER");
  }
}

/** Une table lancée depuis moins longtemps n'est pas rapprochée : le serveur vient de la créer. */
const RECONCILE_AFTER_SECONDS = 60;

/**
 * Rapproche une table « en cours » du serveur de parties. L'annonce de fin
 * (`app/api/engine/result`) peut se perdre : sans cela la table resterait en
 * cours pour toujours. Une partie finie est enregistrée ; une partie que le
 * serveur ne connaît plus est abandonnée. Serveur injoignable : rien ne change.
 */
export async function reconcileTable(table: GameTable): Promise<GameTable> {
  const server = engineServer();
  if (!server || table.status !== "playing" || !table.engineId || !table.startedAt) return table;
  if (DateTime.fromISO(table.startedAt).diffNow("seconds").seconds > -RECONCILE_AFTER_SECONDS) return table;

  let changed = false;
  try {
    const response = await fetch(`${server.url}/games/${table.engineId}`, {
      headers: { authorization: `Bearer ${server.adminToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) {
      changed = await tablesDb.abandonGameTable(table.id, table.engineId);
    } else if (response.ok) {
      const status = (await response.json()) as { result?: EngineResult | null; turn?: unknown; points?: unknown };
      const result = parseEngineResult(status.result, status.turn, status.points);
      if (result) changed = await tablesDb.finishGameTable(table.id, table.engineId, result);
    }
  } catch {
    return table;
  }
  return changed ? ((await tablesDb.getGameTable(table.id)) ?? table) : table;
}

export type TableAccess = {
  /** Adresse WebSocket de la partie, ticket compris. */
  ws: string;
  /** La partie sur le serveur de parties : elle change si la table est relancée. */
  game: string;
  seat: number | null;
};

const TICKET_SECONDS = 12 * 60 * 60;

/** L'entrée d'une personne à une partie lancée : son siège, ou une place de spectateur. */
export function tableAccess(table: GameTable, viewer: Seated | null): TableAccess | null {
  const server = engineServer();
  if (!server || table.status === "waiting" || table.status === "cancelled") return null;

  const game = engineGameId(table);
  const seat = viewer ? table.seats.findIndex((candidate) => candidate.userId === viewer.userId) : -1;
  const ticket = signTicket(
    {
      game,
      role: seat >= 0 ? "player" : "spectator",
      seat: seat >= 0 ? seat : null,
      name: viewer?.name ?? "Spectateur",
      user: viewer?.userId ?? null,
      exp: Math.floor(DateTime.utc().toSeconds()) + TICKET_SECONDS,
    },
    server.secret,
  );
  const base = server.publicUrl.replace(/^http/, "ws");
  return {
    ws: `${base}/games/${game}/ws?ticket=${encodeURIComponent(ticket)}`,
    game,
    seat: seat >= 0 ? seat : null,
  };
}
