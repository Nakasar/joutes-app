"use server";

import { searchDecks } from "@/lib/db/decks.ts";
import { listGameTablesOf } from "@/lib/db/game-tables.ts";
import {
  META_PICKER_DECKS,
  mergeLobbyDecks,
  metaDecks,
  publicDecks,
  sharedDecks,
  toLobbyDeck,
  type LobbyDeck,
} from "@/lib/engine/lobby-decks.ts";
import {
  addBotFor,
  createTableFor,
  guarded,
  joinTableFor,
  leaveSeatFor,
  playableGame as playable,
  readTableFor,
  startTableFor,
  viewer,
  type PlayResult,
  type TableState,
} from "@/lib/engine/table-actions.ts";
import { autoDeckLegends, engineServer, resolveDeck, summarize, TableFailure } from "@/lib/engine/tables.ts";
import type { EngineDeckList } from "@/lib/engine/types.ts";
import type { GameTableSummary } from "@/lib/types/GameTable.ts";

export type { PlayResult, TableState } from "@/lib/engine/table-actions.ts";

export type { LobbyDeck, LobbyDeckSource } from "@/lib/engine/lobby-decks.ts";

export type Lobby = {
  signedIn: boolean;
  name: string | null;
  /** Faux si aucun serveur de parties n'est configuré : seule l'IA est proposée. */
  online: boolean;
  /** Mes decks, puis ceux partagés dans mes groupes, puis les publics les plus aimés. */
  decks: LobbyDeck[];
  tables: GameTableSummary[];
  /** Légendes (codes du moteur) autour desquelles un deck automatique existe. */
  legends: string[];
};

const GAME_SLUG = "riftbound";

const playableGame = () => playable(GAME_SLUG);

/** Ce dont la page Jouer a besoin : les decks jouables (vérifiés par le moteur) et mes tables. */
export async function loadLobby(): Promise<PlayResult<{ lobby: Lobby }>> {
  return guarded(async () => {
    const game = await playableGame();
    const seated = await viewer();
    const online = engineServer() !== null;
    if (!seated) {
      return {
        lobby: {
          signedIn: false,
          name: null,
          online,
          decks: mergeLobbyDecks(...(await Promise.all([metaDecks(game.id, META_PICKER_DECKS), publicDecks(game.id, null)]))),
          tables: [],
          legends: autoDeckLegends(),
        },
      };
    }

    const [{ decks }, shared, popular, meta, tables] = await Promise.all([
      searchDecks({
        playerId: seated.userId,
        viewerId: seated.userId,
        gameId: game.id,
        scope: "mine",
        sortBy: "updatedAt",
        sortOrder: "desc",
        limit: 100,
      }),
      sharedDecks(seated.userId, game.id),
      publicDecks(game.id, seated.userId),
      metaDecks(game.id, META_PICKER_DECKS),
      online ? listGameTablesOf(seated.userId, game.slug, 10) : Promise.resolve([]),
    ]);

    return {
      lobby: {
        signedIn: true,
        name: seated.name,
        online,
        // Un deck à la fois partagé et public reste rangé avec les partagés.
        decks: mergeLobbyDecks(
          decks.map((deck) => toLobbyDeck(deck, "mine")),
          shared,
          meta,
          popular,
        ),
        tables: tables.map(summarize),
        legends: autoDeckLegends(),
      },
    };
  });
}

/**
 * Les decks publics dont le nom, la description ou la légende contient
 * `query` : la combobox les demande pendant la frappe, mes decks et ceux de
 * mes groupes étant déjà dans la page.
 */
export async function searchPlayDecksAction(query: unknown): Promise<PlayResult<{ decks: LobbyDeck[] }>> {
  return guarded(async () => {
    const game = await playableGame();
    if (typeof query !== "string") throw new TableFailure("INVALID");
    const search = query.trim().slice(0, 80);
    if (search.length < 2) return { decks: [] };
    const seated = await viewer();
    return { decks: await publicDecks(game.id, seated?.userId ?? null, search) };
  });
}

export async function createTableAction(mode: unknown, choice: unknown): Promise<PlayResult<{ id: string }>> {
  return createTableFor(GAME_SLUG, mode, choice);
}

export async function joinTableAction(id: unknown, choice: unknown): Promise<PlayResult> {
  return joinTableFor(GAME_SLUG, id, choice);
}

export async function addBotAction(id: unknown, level: unknown): Promise<PlayResult> {
  return addBotFor(GAME_SLUG, id, level);
}

/** `name` : le nom affiché au siège visé, pour ne pas retirer quelqu'un d'autre si la salle a bougé. */
export async function leaveSeatAction(id: unknown, seat: unknown, name: unknown): Promise<PlayResult> {
  return leaveSeatFor(GAME_SLUG, id, seat, name);
}

export async function startTableAction(id: unknown): Promise<PlayResult> {
  return startTableFor(GAME_SLUG, id);
}

export async function readTableAction(id: unknown): Promise<PlayResult<{ state: TableState }>> {
  return readTableFor(GAME_SLUG, id);
}

/**
 * Le deck d'un invité en mode hôte, donné par son lien ou son identifiant
 * Joutes. Seuls les decks que le demandeur peut voir sont lus.
 */
export async function resolveDeckAction(
  reference: unknown,
): Promise<PlayResult<{ name: string; list: EngineDeckList }>> {
  return guarded(async () => {
    const game = await playableGame();
    const seated = await viewer();
    if (typeof reference !== "string") throw new TableFailure("INVALID");
    const deckId = /[a-f0-9]{24}/i.exec(reference)?.[0];
    if (!deckId) throw new TableFailure("INVALID_DECK");
    const { deck, deckName } = await resolveDeck({ kind: "deck", deckId }, seated?.userId ?? null, game.id);
    return { name: deckName, list: deck };
  });
}
