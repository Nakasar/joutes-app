import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import {
  deleteDeckSimulation,
  getDeckSimulation,
  getDeckSimulationForRecord,
  insertDeckSimulation,
  listDeckSimulations,
  pruneDeckSimulations,
  pushDeckSimulationGames,
  setDeckSimulationTarget,
} from "@/lib/db/deck-simulations";
import { readGameBySlugOrId } from "@/lib/db/games-cached";
import type { LobbyDeckSource } from "@/lib/engine/lobby-decks";
import {
  MAX_POOL_DECKS,
  MAX_SIMULATION_GAMES,
  parseSimulationGame,
  SIMULATION_SOURCES,
  type SimulationDeck,
  type SimulationGame,
  type SimulationList,
  type SimulationSource,
} from "@/lib/engine/simulation";
import { isBotLevel } from "@/lib/engine/tables";
import type { DeckSimulation, DeckSimulationSummary } from "@/lib/types/DeckSimulation";

/**
 * Ce que font les actions serveur de la page Simuler, quel que soit le jeu :
 * chaque page (`games/<jeu>/play/simulate/actions.ts`) les expose pour son jeu,
 * décrit par un `SimulatorGame`.
 */

/** Les échecs sortent en codes : ces actions ne savent pas dans quelle langue la page est rendue. */
export type SimError = "UNAUTHENTICATED" | "NOT_FOUND" | "INVALID" | "INVALID_DECK" | "EMPTY_POOL" | "SERVER";
export type SimResult<T = object> = ({ ok: true } & T) | { ok: false; error: SimError };

export class SimFailure extends Error {
  constructor(readonly code: SimError) {
    super(code);
  }
}

/** Un deck Joutes proposé à la simulation : ce que les deux jeux ont en commun dans leur fiche. */
export type SimulatorDeck = {
  id: string;
  name: string;
  source: LobbyDeckSource;
  /** Code moteur de la légende, ou du leader. */
  legend: string | null;
  domains?: string[];
  list: SimulationList | null;
};

/** Ce qu'un jeu fournit au simulateur. */
export type SimulatorGame<D extends SimulatorDeck> = {
  slug: string;
  /** La version du moteur qui joue les parties de ce jeu. */
  engine: string;
  /** Mes decks, ceux de mes groupes, la méta et les publics les plus aimés. */
  decks: (userId: string, gameId: string) => Promise<D[]>;
  /** Les decks de tournoi offerts comme adversaires ; vide pour un jeu sans méta. */
  metaDecks: (gameId: string, count: number) => Promise<D[]>;
  /** Les légendes (ou leaders) autour desquelles le moteur construit un deck. */
  autoLegends: () => string[];
  autoList: (legend: string, seed: number) => SimulationList | null;
  cardName: (legend: string) => string;
  /** Un deck Joutes lu avec les droits de la personne et vérifié par le moteur. */
  resolve: (deckId: string, userId: string, gameId: string) => Promise<{ list: SimulationList; name: string; legend: string }>;
  validate: (list: SimulationList) => string[];
};

/** Séries gardées par personne et par jeu ; les plus anciennes sont supprimées. */
const MAX_SIMULATIONS_PER_USER = 50;

async function context(slug: string): Promise<{ userId: string; name: string; gameId: string }> {
  const game = await readGameBySlugOrId(slug);
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

export type Simulator<D extends SimulatorDeck = SimulatorDeck> = {
  name: string;
  decks: D[];
  /** Combien de decks chaque ensemble offre comme adversaires, une fois les injouables écartés. */
  pools: Record<SimulationSource, number>;
  legends: string[];
  history: DeckSimulationSummary[];
};

/** La page Simuler : mes decks à évaluer, les ensembles d'adversaires, mes séries. */
export function loadSimulatorFor<D extends SimulatorDeck>(game: SimulatorGame<D>): Promise<SimResult<{ simulator: Simulator<D> }>> {
  return guarded(async () => {
    const { userId, name, gameId } = await context(game.slug);
    const [decks, meta, history] = await Promise.all([
      game.decks(userId, gameId),
      game.metaDecks(gameId, MAX_POOL_DECKS),
      listDeckSimulations(userId, gameId),
    ]);
    const playable = (list: SimulatorDeck[]) => list.filter((deck) => deck.list).length;
    return {
      simulator: {
        name,
        decks,
        pools: {
          meta: playable(meta),
          mine: playable(decks.filter((deck) => deck.source === "mine")),
          shared: playable(decks.filter((deck) => deck.source === "shared")),
          public: playable(decks.filter((deck) => deck.source === "public")),
          auto: distinctAutoLegends(game).length,
        },
        legends: game.autoLegends(),
        history,
      },
    };
  });
}

function fromLobby(deck: SimulatorDeck, source: SimulationDeck["source"]): SimulationDeck | null {
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
function autoDeck(game: SimulatorGame<SimulatorDeck>, legend: string, seed: number): SimulationDeck | null {
  const list = game.autoList(legend, seed);
  return list ? { key: `auto:${legend}`, name: game.cardName(legend), source: "auto", legend, list } : null;
}

/** Une légende par nom : les éditions alternatives d'une même légende ne comptent qu'une fois. */
function distinctAutoLegends(game: SimulatorGame<SimulatorDeck>): string[] {
  const names = new Set<string>();
  return game.autoLegends().filter((legend) => {
    const name = game.cardName(legend);
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
async function resolveRef(
  game: SimulatorGame<SimulatorDeck>,
  ref: DeckRef,
  userId: string,
  gameId: string,
  source: SimulationDeck["source"],
): Promise<SimulationDeck> {
  if (ref.kind === "auto") {
    if (!game.autoLegends().includes(ref.legend)) throw new SimFailure("INVALID_DECK");
    const deck = autoDeck(game, ref.legend, randomSeed());
    if (!deck) throw new SimFailure("INVALID_DECK");
    return { ...deck, source };
  }
  try {
    const { list, name, legend } = await game.resolve(ref.deckId, userId, gameId);
    return { key: `deck:${ref.deckId}`, name, source, legend, deckId: ref.deckId, list };
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
  game: SimulatorGame<SimulatorDeck>,
  sources: SimulationSource[],
  userId: string,
  gameId: string,
  exclude: string,
): Promise<SimulationDeck[]> {
  const decks = sources.some((source) => source !== "meta" && source !== "auto") ? await game.decks(userId, gameId) : [];
  // Chaque source donne sa liste ; le plafond se partage ensuite à tour de
  // rôle, pour qu'une grande source (la méta) n'évince pas les autres.
  const lists: SimulationDeck[][] = [];
  for (const source of sources) {
    if (source === "meta") {
      lists.push((await game.metaDecks(gameId, MAX_POOL_DECKS)).map((deck) => fromLobby(deck, "meta")).filter(isDeck));
    } else if (source === "auto") {
      // Un deck automatique par légende, tiré une fois pour toute la série.
      lists.push(distinctAutoLegends(game).map((legend) => autoDeck(game, legend, randomSeed())).filter(isDeck));
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
export function createSimulationFor(game: SimulatorGame<SimulatorDeck>, input: unknown): Promise<SimResult<{ id: string }>> {
  return guarded(async () => {
    const { userId, gameId } = await context(game.slug);
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
    const deck = await resolveRef(game, parseRef(value.deck), userId, gameId, "fixed");

    let opponent: DeckSimulation["opponent"];
    let pool: SimulationDeck[];
    if (value.opponent?.kind === "fixed") {
      opponent = { kind: "fixed" };
      pool = [await resolveRef(game, parseRef(value.opponent.deck), userId, gameId, "fixed")];
      // Le même deck des deux côtés : un miroir, permis, mais sous une autre clé.
      if (pool[0].key === deck.key) pool[0] = { ...pool[0], key: `${pool[0].key}:mirror` };
    } else if (value.opponent?.kind === "pool") {
      const raw = Array.isArray(value.opponent.sources) ? value.opponent.sources : [];
      const sources = SIMULATION_SOURCES.filter((source) => raw.includes(source));
      if (sources.length === 0) throw new SimFailure("EMPTY_POOL");
      opponent = { kind: "pool", sources, byLegend: value.opponent.byLegend === true };
      pool = await poolOf(game, sources, userId, gameId, deck.key);
      if (pool.length === 0) throw new SimFailure("EMPTY_POOL");
    } else {
      throw new SimFailure("INVALID");
    }
    if (game.validate(deck.list).length > 0) throw new SimFailure("INVALID_DECK");

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
      engine: game.engine,
      createdAt: now,
      updatedAt: now,
    });
    // Les séries les plus anciennes au-delà de la limite partent : le compte ne grossit pas sans fin.
    await pruneDeckSimulations(userId, gameId, MAX_SIMULATIONS_PER_USER);
    return { id };
  });
}

export function getSimulationFor(slug: string, id: unknown): Promise<SimResult<{ simulation: DeckSimulation; name: string }>> {
  return guarded(async () => {
    const { userId, name } = await context(slug);
    if (typeof id !== "string") throw new SimFailure("NOT_FOUND");
    const simulation = await getDeckSimulation(id, userId);
    if (!simulation) throw new SimFailure("NOT_FOUND");
    return { simulation, name };
  });
}

/** Enregistre des parties jouées par le navigateur. Une partie déjà reçue n'est pas comptée deux fois. */
export function recordSimulationGamesFor(slug: string, id: unknown, games: unknown): Promise<SimResult<{ added: number }>> {
  return guarded(async () => {
    const { userId } = await context(slug);
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
export function extendSimulationFor(slug: string, id: unknown, more: unknown): Promise<SimResult<{ target: number }>> {
  return guarded(async () => {
    const { userId } = await context(slug);
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

export function deleteSimulationFor(slug: string, id: unknown): Promise<SimResult> {
  return guarded(async () => {
    const { userId } = await context(slug);
    if (typeof id !== "string" || !(await deleteDeckSimulation(id, userId))) throw new SimFailure("NOT_FOUND");
    return {};
  });
}
