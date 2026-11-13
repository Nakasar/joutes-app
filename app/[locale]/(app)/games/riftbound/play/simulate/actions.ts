"use server";

import { searchDecks } from "@/lib/db/decks.ts";
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
  createSimulationFor,
  deleteSimulationFor,
  extendSimulationFor,
  getSimulationFor,
  loadSimulatorFor,
  recordSimulationGamesFor,
  type SimResult,
  type Simulator as SharedSimulator,
  type SimulatorGame,
} from "@/lib/engine/simulation-actions.ts";
import { autoDeckLegends, resolveDeck } from "@/lib/engine/tables.ts";
import type { EngineDeckList } from "@/lib/engine/types.ts";
import { ENGINE_VERSION } from "@/lib/engine/version.ts";
import type { DeckSimulation } from "@/lib/types/DeckSimulation.ts";

export type { SimError, SimResult } from "@/lib/engine/simulation-actions.ts";

export type Simulator = SharedSimulator<LobbyDeck>;

const GAME_SLUG = "riftbound";
/** Decks publics les plus aimés proposés comme adversaires. */
const PUBLIC_POOL = 50;

/** Riftbound pour le simulateur : ses decks, sa méta, ses decks automatiques. */
const RIFTBOUND: SimulatorGame<LobbyDeck> = {
  slug: GAME_SLUG,
  engine: ENGINE_VERSION,
  /** Mes decks, ceux de mes groupes, les decks méta récents et les publics les plus aimés : ce que je peux faire évaluer ou affronter. */
  decks: async (userId, gameId) => {
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
  },
  metaDecks,
  autoLegends: autoDeckLegends,
  autoList: autoEngineDeck,
  cardName: (legend) => engineCards().get(legend)?.name ?? legend,
  resolve: async (deckId, userId, gameId) => {
    const { deck, deckName } = await resolveDeck({ kind: "deck", deckId }, userId, gameId);
    return { list: deck, name: deckName, legend: deck.legend };
  },
  validate: (list) => validateEngineDeck(list as EngineDeckList),
};

/** La page Simuler : mes decks à évaluer, les ensembles d'adversaires, mes séries. */
export async function loadSimulatorAction(): Promise<SimResult<{ simulator: Simulator }>> {
  return loadSimulatorFor(RIFTBOUND);
}

/**
 * Crée une série : mon deck, l'adversaire (un deck précis ou un ensemble où
 * tirer), le niveau des IA et le nombre de parties. Les parties se jouent
 * ensuite dans le navigateur.
 */
export async function createSimulationAction(input: unknown): Promise<SimResult<{ id: string }>> {
  return createSimulationFor(RIFTBOUND, input);
}

export async function getSimulationAction(id: unknown): Promise<SimResult<{ simulation: DeckSimulation; name: string }>> {
  return getSimulationFor(GAME_SLUG, id);
}

/** Enregistre des parties jouées par le navigateur. Une partie déjà reçue n'est pas comptée deux fois. */
export async function recordSimulationGamesAction(id: unknown, games: unknown): Promise<SimResult<{ added: number }>> {
  return recordSimulationGamesFor(GAME_SLUG, id, games);
}

/** Ajoute des parties à une série (« Ajouter 50 parties »). */
export async function extendSimulationAction(id: unknown, more: unknown): Promise<SimResult<{ target: number }>> {
  return extendSimulationFor(GAME_SLUG, id, more);
}

export async function deleteSimulationAction(id: unknown): Promise<SimResult> {
  return deleteSimulationFor(GAME_SLUG, id);
}
