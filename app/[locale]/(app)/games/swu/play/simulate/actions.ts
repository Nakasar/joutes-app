"use server";

import { searchDecks } from "@/lib/db/decks.ts";
import { mergeLobbyDecks, publicDecks, sharedDecks } from "@/lib/engine/lobby-decks.ts";
import {
  createSimulationFor,
  deleteSimulationFor,
  extendSimulationFor,
  getSimulationFor,
  loadSimulatorFor,
  recordSimulationGamesFor,
  type SimResult,
  type Simulator,
  type SimulatorGame,
} from "@/lib/engine/simulation-actions.ts";
import { toSwuLobbyDeck, type SwuLobbyDeck } from "@/lib/engine/swu/lobby-decks.ts";
import { autoSwuDeck, swuAutoLeaders, swuEngineCards, validateSwuDeck } from "@/lib/engine/swu/server.ts";
import type { SwuDeckList } from "@/lib/engine/swu/types.ts";
import { SWU_ENGINE_VERSION } from "@/lib/engine/swu/version.ts";
import { resolveSwuDeck } from "@/lib/engine/tables.ts";
import type { DeckSimulation } from "@/lib/types/DeckSimulation.ts";

export type SwuSimulator = Simulator<SwuLobbyDeck>;

const GAME_SLUG = "swu";
/** Decks publics les plus aimés proposés comme adversaires. */
const PUBLIC_POOL = 50;

/** Le nom complet d'un leader : deux leaders d'un même personnage sont deux decks différents. */
function leaderName(code: string): string {
  const card = swuEngineCards().get(code);
  return card ? [card.name, card.subtitle].filter(Boolean).join(", ") : code;
}

/** Star Wars: Unlimited pour le simulateur : ses decks et ses decks automatiques. Pas de méta pour ce jeu. */
const SWU: SimulatorGame<SwuLobbyDeck> = {
  slug: GAME_SLUG,
  engine: SWU_ENGINE_VERSION,
  decks: async (userId, gameId) => {
    const [{ decks: mine }, shared, popular] = await Promise.all([
      searchDecks({
        playerId: userId,
        viewerId: userId,
        gameId,
        scope: "mine",
        sortBy: "updatedAt",
        sortOrder: "desc",
        limit: 100,
      }),
      sharedDecks(userId, gameId, toSwuLobbyDeck),
      publicDecks(gameId, userId, undefined, PUBLIC_POOL, toSwuLobbyDeck),
    ]);
    return mergeLobbyDecks(mine.map((deck) => toSwuLobbyDeck(deck, "mine")), shared, popular);
  },
  metaDecks: async () => [],
  autoLegends: swuAutoLeaders,
  autoList: autoSwuDeck,
  cardName: leaderName,
  resolve: async (deckId, userId, gameId) => {
    const { deck, deckName } = await resolveSwuDeck({ kind: "deck", deckId }, userId, gameId);
    return { list: deck, name: deckName, legend: deck.leader };
  },
  validate: (list) => validateSwuDeck(list as SwuDeckList),
};

/** La page Simuler de Star Wars: Unlimited : mes decks à évaluer, les ensembles d'adversaires, mes séries. */
export async function loadSwuSimulatorAction(): Promise<SimResult<{ simulator: SwuSimulator }>> {
  return loadSimulatorFor(SWU);
}

export async function createSwuSimulationAction(input: unknown): Promise<SimResult<{ id: string }>> {
  return createSimulationFor(SWU, input);
}

export async function getSwuSimulationAction(id: unknown): Promise<SimResult<{ simulation: DeckSimulation; name: string }>> {
  return getSimulationFor(GAME_SLUG, id);
}

/** Enregistre des parties jouées par le navigateur. Une partie déjà reçue n'est pas comptée deux fois. */
export async function recordSwuSimulationGamesAction(id: unknown, games: unknown): Promise<SimResult<{ added: number }>> {
  return recordSimulationGamesFor(GAME_SLUG, id, games);
}

export async function extendSwuSimulationAction(id: unknown, more: unknown): Promise<SimResult<{ target: number }>> {
  return extendSimulationFor(GAME_SLUG, id, more);
}

export async function deleteSwuSimulationAction(id: unknown): Promise<SimResult> {
  return deleteSimulationFor(GAME_SLUG, id);
}
