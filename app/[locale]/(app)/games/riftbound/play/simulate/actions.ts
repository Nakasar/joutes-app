"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth.ts";
import { searchDecks } from "@/lib/db/decks.ts";
import {
  deleteDeckSimulation,
  getDeckSimulation,
  getDeckSimulationForRecord,
  insertDeckSimulation,
  listDeckSimulations,
  pruneDeckSimulations,
  pushDeckSimulationGames,
  setDeckSimulationTarget,
} from "@/lib/db/deck-simulations.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import {
  META_PICKER_DECKS,
  mergeLobbyDecks,
  metaDecks,
  publicDecks,
  sharedDecks,
  toLobbyDeck,
  type LobbyDeck,
} from "@/lib/engine/lobby-decks.ts";
import { autoEngineDeck, engineCards, validateEngineDeck } from "@/lib/engine/server.ts";
import {
  MAX_POOL_DECKS,
  MAX_SIMULATION_GAMES,
  parseSimulationGame,
  SIMULATION_SOURCES,
  type SimulationDeck,
  type SimulationGame,
  type SimulationSource,
} from "@/lib/engine/simulation.ts";
import { autoDeckLegends, isBotLevel, resolveDeck } from "@/lib/engine/tables.ts";
import { ENGINE_VERSION } from "@/lib/engine/version.ts";
import type { DeckSimulation, DeckSimulationSummary } from "@/lib/types/DeckSimulation.ts";

/** Les échecs sortent en codes : ces actions ne savent pas dans quelle langue la page est rendue. */
export type SimError = "UNAUTHENTICATED" | "NOT_FOUND" | "INVALID" | "INVALID_DECK" | "EMPTY_POOL" | "SERVER";
export type SimResult<T = object> = ({ ok: true } & T) | { ok: false; error: SimError };

class SimFailure extends Error {
  constructor(readonly code: SimError) {
    super(code);
  }
}

const GAME_SLUG = "riftbound";
/** Decks publics les plus aimés proposés comme adversaires. */
const PUBLIC_POOL = 50;
/** Séries gardées par personne et par jeu ; les plus anciennes sont supprimées. */
const MAX_SIMULATIONS_PER_USER = 50;

async function context(): Promise<{ userId: string; name: string; gameId: string }> {
  const game = await readGameBySlugOrId(GAME_SLUG);
  if (!game?.features?.play) throw new SimFailure("NOT_FOUND");
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user?.id) throw new SimFailure("UNAUTHENTICATED");
  const displayName = (user as { displayName?: string }).displayName;
  return { userId: user.id, name: (displayName || user.name || "Joueur").slice(0, 40), gameId: game.id };
}

async function guarded<T extends object>(run: () => Promise<T>): Promise<SimResult<T>> {
  try {
    return { ok: true, ...(await run()) };
  } catch (error) {
    if (error instanceof SimFailure) return { ok: false, error: error.code };
    console.error("Simulation de deck :", error);
    return { ok: false, error: "SERVER" };
  }
}

/** Mes decks, ceux de mes groupes, les decks méta récents et les publics les plus aimés : ce que je peux faire évaluer ou affronter. */
async function playableDecks(userId: string, gameId: string): Promise<LobbyDeck[]> {
  const [{ decks: mine }, shared, meta, popular] = await Promise.all([
    searchDecks({
      playerId: userId,
      viewerId: userId,
      gameId,
      scope: "mine",
      sortBy: "updatedAt",
      sortOrder: "desc",
      limit: 100,
    }),
    sharedDecks(userId, gameId),
    metaDecks(gameId, META_PICKER_DECKS),
    publicDecks(gameId, userId, undefined, PUBLIC_POOL),
  ]);
  return mergeLobbyDecks(mine.map((deck) => toLobbyDeck(deck, "mine")), shared, meta, popular);
}

export type Simulator = {
  name: string;
  decks: LobbyDeck[];
  /** Combien de decks chaque ensemble offre comme adversaires, une fois les injouables écartés. */
  pools: Record<SimulationSource, number>;
  legends: string[];
  history: DeckSimulationSummary[];
};

/** La page Simuler : mes decks à évaluer, les ensembles d'adversaires, mes séries. */
export async function loadSimulatorAction(): Promise<SimResult<{ simulator: Simulator }>> {
  return guarded(async () => {
    const { userId, name, gameId } = await context();
    const [decks, meta, history] = await Promise.all([
      playableDecks(userId, gameId),
      metaDecks(gameId, MAX_POOL_DECKS),
      listDeckSimulations(userId, gameId),
    ]);
    const legends = autoDeckLegends();
    const playable = (list: LobbyDeck[]) => list.filter((deck) => deck.list).length;
    return {
      simulator: {
        name,
        decks,
        pools: {
          meta: playable(meta),
          mine: playable(decks.filter((deck) => deck.source === "mine")),
          shared: playable(decks.filter((deck) => deck.source === "shared")),
          public: playable(decks.filter((deck) => deck.source === "public")),
          auto: distinctAutoLegends().length,
        },
        legends,
        history,
      },
    };
  });
}

function fromLobby(deck: LobbyDeck, source: SimulationDeck["source"]): SimulationDeck | null {
  if (!deck.list || !deck.legend) return null;
  return {
    key: `deck:${deck.id}`,
    name: deck.name,
    source,
    legend: deck.legend,
    ...(deck.domains?.length ? { domains: deck.domains } : {}),
    deckId: deck.id,
    list: deck.list,
  };
}

/** Le deck automatique d'une légende, nommé comme elle. */
function autoDeck(legend: string, seed: number): SimulationDeck | null {
  const list = autoEngineDeck(legend, seed);
  const name = engineCards().get(legend)?.name ?? legend;
  return list ? { key: `auto:${legend}`, name, source: "auto", legend, list } : null;
}

/** Une légende par nom : les éditions alternatives d'une même légende ne comptent qu'une fois. */
function distinctAutoLegends(): string[] {
  const names = new Set<string>();
  return autoDeckLegends().filter((legend) => {
    const name = engineCards().get(legend)?.name ?? legend;
    if (names.has(name)) return false;
    names.add(name);
    return true;
  });
}

type DeckRef = { kind: "deck"; deckId: string } | { kind: "auto"; legend: string };

function parseRef(value: unknown): DeckRef {
  const ref = value as { kind?: unknown; deckId?: unknown; legend?: unknown } | null;
  if (ref?.kind === "deck" && typeof ref.deckId === "string" && /^[a-f0-9]{24}$/i.test(ref.deckId)) {
    return { kind: "deck", deckId: ref.deckId };
  }
  if (ref?.kind === "auto" && typeof ref.legend === "string" && ref.legend.length < 20) {
    return { kind: "auto", legend: ref.legend };
  }
  throw new SimFailure("INVALID");
}

/** Un deck désigné, lu avec les droits de la personne et vérifié par le moteur. */
async function resolveRef(ref: DeckRef, userId: string, gameId: string, source: SimulationDeck["source"]): Promise<SimulationDeck> {
  if (ref.kind === "auto") {
    if (!autoDeckLegends().includes(ref.legend)) throw new SimFailure("INVALID_DECK");
    const deck = autoDeck(ref.legend, randomSeed());
    if (!deck) throw new SimFailure("INVALID_DECK");
    return { ...deck, source };
  }
  try {
    const { deck: list, deckName } = await resolveDeck(ref, userId, gameId);
    const deck = fromLobby(
      { id: ref.deckId, name: deckName, source: "mine", legend: list.legend, list, problems: [] },
      source,
    );
    if (!deck) throw new SimFailure("INVALID_DECK");
    return deck;
  } catch (error) {
    if (error instanceof SimFailure) throw error;
    throw new SimFailure("INVALID_DECK");
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31) + 1;
}

const isDeck = (deck: SimulationDeck | null): deck is SimulationDeck => deck !== null;

/** Les decks d'un ensemble, figés pour la série. Le deck évalué n'est pas son propre adversaire. */
async function poolOf(
  sources: SimulationSource[],
  userId: string,
  gameId: string,
  exclude: string,
): Promise<SimulationDeck[]> {
  const decks = sources.some((source) => source !== "meta" && source !== "auto")
    ? await playableDecks(userId, gameId)
    : [];
  // Chaque source donne sa liste ; le plafond se partage ensuite à tour de
  // rôle, pour qu'une grande source (la méta) n'évince pas les autres.
  const lists: SimulationDeck[][] = [];
  for (const source of sources) {
    if (source === "meta") {
      lists.push((await metaDecks(gameId, MAX_POOL_DECKS)).map((deck) => fromLobby(deck, "meta")).filter(isDeck));
    } else if (source === "auto") {
      // Un deck automatique par légende, tiré une fois pour toute la série.
      lists.push(distinctAutoLegends().map((legend) => autoDeck(legend, randomSeed())).filter(isDeck));
    } else {
      lists.push(decks.filter((candidate) => candidate.source === source).map((deck) => fromLobby(deck, source)).filter(isDeck));
    }
  }
  const pool: SimulationDeck[] = [];
  const seen = new Set<string>([exclude]);
  for (let index = 0; pool.length < MAX_POOL_DECKS && lists.some((list) => index < list.length); index++) {
    for (const list of lists) {
      const deck = list[index];
      if (!deck || seen.has(deck.key) || pool.length >= MAX_POOL_DECKS) continue;
      seen.add(deck.key);
      pool.push(deck);
    }
  }
  return pool;
}

/**
 * Crée une série : mon deck, l'adversaire (un deck précis ou un ensemble où
 * tirer), le niveau des IA et le nombre de parties. Les parties se jouent
 * ensuite dans le navigateur.
 */
export async function createSimulationAction(input: unknown): Promise<SimResult<{ id: string }>> {
  return guarded(async () => {
    const { userId, gameId } = await context();
    const value = input as {
      deck?: unknown;
      opponent?: { kind?: unknown; deck?: unknown; sources?: unknown; byLegend?: unknown };
      level?: unknown;
      games?: unknown;
    } | null;
    if (!value || !isBotLevel(value.level)) throw new SimFailure("INVALID");
    const games = value.games;
    if (typeof games !== "number" || !Number.isInteger(games) || games < 1 || games > MAX_SIMULATION_GAMES) {
      throw new SimFailure("INVALID");
    }
    const deck = await resolveRef(parseRef(value.deck), userId, gameId, "fixed");

    let opponent: DeckSimulation["opponent"];
    let pool: SimulationDeck[];
    if (value.opponent?.kind === "fixed") {
      opponent = { kind: "fixed" };
      pool = [await resolveRef(parseRef(value.opponent.deck), userId, gameId, "fixed")];
      // Le même deck des deux côtés : un miroir, permis, mais sous une autre clé.
      if (pool[0].key === deck.key) pool[0] = { ...pool[0], key: `${pool[0].key}:mirror` };
    } else if (value.opponent?.kind === "pool") {
      const raw = Array.isArray(value.opponent.sources) ? value.opponent.sources : [];
      const sources = SIMULATION_SOURCES.filter((source) => raw.includes(source));
      if (sources.length === 0) throw new SimFailure("EMPTY_POOL");
      opponent = { kind: "pool", sources, byLegend: value.opponent.byLegend === true };
      pool = await poolOf(sources, userId, gameId, deck.key);
      if (pool.length === 0) throw new SimFailure("EMPTY_POOL");
    } else {
      throw new SimFailure("INVALID");
    }
    if (validateEngineDeck(deck.list).length > 0) throw new SimFailure("INVALID_DECK");

    const now = new Date().toISOString();
    const id = await insertDeckSimulation({
      userId,
      gameId,
      level: value.level,
      target: games,
      deck,
      opponent,
      pool,
      games: [],
      engine: ENGINE_VERSION,
      createdAt: now,
      updatedAt: now,
    });
    // Les séries les plus anciennes au-delà de la limite partent : le compte ne grossit pas sans fin.
    await pruneDeckSimulations(userId, gameId, MAX_SIMULATIONS_PER_USER);
    return { id };
  });
}

export async function getSimulationAction(id: unknown): Promise<SimResult<{ simulation: DeckSimulation; name: string }>> {
  return guarded(async () => {
    const { userId, name } = await context();
    if (typeof id !== "string") throw new SimFailure("NOT_FOUND");
    const simulation = await getDeckSimulation(id, userId);
    if (!simulation) throw new SimFailure("NOT_FOUND");
    return { simulation, name };
  });
}

/** Enregistre des parties jouées par le navigateur. Une partie déjà reçue n'est pas comptée deux fois. */
export async function recordSimulationGamesAction(id: unknown, games: unknown): Promise<SimResult<{ added: number }>> {
  return guarded(async () => {
    const { userId } = await context();
    if (typeof id !== "string" || !Array.isArray(games) || games.length === 0 || games.length > 50) {
      throw new SimFailure("INVALID");
    }
    const simulation = await getDeckSimulationForRecord(id, userId);
    if (!simulation) throw new SimFailure("NOT_FOUND");
    const opponents = Object.fromEntries(simulation.opponents.map((key) => [key, true]));
    const parsed = games.map((game) => parseSimulationGame(game, opponents));
    if (parsed.some((game) => game === null || game.n >= simulation.target)) throw new SimFailure("INVALID");
    const ns = new Set(parsed.map((game) => (game as SimulationGame).n));
    if (ns.size !== parsed.length) throw new SimFailure("INVALID");
    return { added: await pushDeckSimulationGames(id, userId, parsed as SimulationGame[]) };
  });
}

/** Ajoute des parties à une série (« Ajouter 50 parties »). */
export async function extendSimulationAction(id: unknown, more: unknown): Promise<SimResult<{ target: number }>> {
  return guarded(async () => {
    const { userId } = await context();
    if (typeof id !== "string" || typeof more !== "number" || !Number.isInteger(more) || more < 1) {
      throw new SimFailure("INVALID");
    }
    const simulation = await getDeckSimulation(id, userId);
    if (!simulation) throw new SimFailure("NOT_FOUND");
    const target = Math.min(MAX_SIMULATION_GAMES, Math.max(simulation.target, simulation.games.length) + more);
    await setDeckSimulationTarget(id, userId, target);
    return { target };
  });
}

export async function deleteSimulationAction(id: unknown): Promise<SimResult> {
  return guarded(async () => {
    const { userId } = await context();
    if (typeof id !== "string" || !(await deleteDeckSimulation(id, userId))) throw new SimFailure("NOT_FOUND");
    return {};
  });
}
