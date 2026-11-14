"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth.ts";
import { searchDecks } from "@/lib/db/decks.ts";
import { listGameTablesOf } from "@/lib/db/game-tables.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { mergeLobbyDecks, publicDecks, sharedDecks } from "@/lib/engine/lobby-decks.ts";
import { swuAutoDeckCards, toSwuLobbyDeck, type SwuLobbyDeck } from "@/lib/engine/swu/lobby-decks.ts";
import {
  addBotFor,
  createTableFor,
  guarded,
  joinTableFor,
  leaveSeatFor,
  playAccess,
  readTableFor,
  requireHost,
  startTableFor,
  type PlayAccess,
  type PlayResult,
  type TableState,
  playableGame as playableTableGame,
  viewer as tableViewer,
} from "@/lib/engine/table-actions.ts";
import { engineServer, resolveSwuDeck, summarize, TableFailure } from "@/lib/engine/tables.ts";
import type { SwuDeckList } from "@/lib/engine/swu/types.ts";
import type { GameTableSummary } from "@/lib/types/GameTable.ts";

export type { SwuLobbyDeck } from "@/lib/engine/swu/lobby-decks.ts";

export type SwuLobby = {
  signedIn: boolean;
  name: string | null;
  /** Faux si aucun serveur de parties n'est configuré : seule l'IA est proposée. */
  online: boolean;
  /** Mes tables en ligne à ce jeu, les plus récentes d'abord. */
  tables: GameTableSummary[];
  /** Mes decks, puis ceux partagés dans mes groupes, puis les publics les plus aimés. */
  decks: SwuLobbyDeck[];
  /** Leaders et bases (codes du moteur) pour un deck automatique. */
  leaders: string[];
  bases: string[];
  /** Ce que mon abonnement ouvre : héberger une partie, simuler un deck. */
  access: PlayAccess;
};

export type SwuPlayResult<T = object> = ({ ok: true } & T) | { ok: false };

const GAME_SLUG = "swu";

async function viewer(): Promise<{ userId: string; name: string } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user?.id) return null;
  const displayName = (user as { displayName?: string }).displayName;
  return { userId: user.id, name: (displayName || user.name || "Joueur").slice(0, 40) };
}

async function playableGame(): Promise<{ id: string } | null> {
  const game = await readGameBySlugOrId(GAME_SLUG);
  return game?.features?.play ? { id: game.id } : null;
}

/** Ce dont la page Jouer de Star Wars: Unlimited a besoin : les decks, vérifiés par le moteur. */
export async function loadSwuLobby(): Promise<SwuPlayResult<{ lobby: SwuLobby }>> {
  try {
    const game = await playableGame();
    if (!game) return { ok: false };
    const seated = await viewer();
    const auto = swuAutoDeckCards();
    const online = engineServer() !== null;
    const access = await playAccess();
    if (!seated) {
      return {
        ok: true,
        lobby: {
          signedIn: false,
          name: null,
          online,
          tables: [],
          decks: await publicDecks(game.id, null, undefined, undefined, toSwuLobbyDeck),
          ...auto,
          access,
        },
      };
    }
    const [{ decks }, shared, popular, tables] = await Promise.all([
      searchDecks({
        playerId: seated.userId,
        viewerId: seated.userId,
        gameId: game.id,
        scope: "mine",
        sortBy: "updatedAt",
        sortOrder: "desc",
        limit: 100,
      }),
      sharedDecks(seated.userId, game.id, toSwuLobbyDeck),
      publicDecks(game.id, seated.userId, undefined, undefined, toSwuLobbyDeck),
      online ? listGameTablesOf(seated.userId, GAME_SLUG, 10) : Promise.resolve([]),
    ]);
    return {
      ok: true,
      lobby: {
        signedIn: true,
        name: seated.name,
        online,
        tables: tables.map(summarize),
        decks: mergeLobbyDecks(
          decks.map((deck) => toSwuLobbyDeck(deck, "mine")),
          shared,
          popular,
        ),
        ...auto,
        access,
      },
    };
  } catch (error) {
    console.error("Table de jeu SWU :", error);
    return { ok: false };
  }
}

/** Les decks publics dont le nom ou la description contient `query`. */
export async function searchSwuPlayDecksAction(query: unknown): Promise<SwuPlayResult<{ decks: SwuLobbyDeck[] }>> {
  try {
    const game = await playableGame();
    if (!game || typeof query !== "string") return { ok: false };
    const search = query.trim().slice(0, 80);
    if (search.length < 2) return { ok: true, decks: [] };
    const seated = await viewer();
    return { ok: true, decks: await publicDecks(game.id, seated?.userId ?? null, search, undefined, toSwuLobbyDeck) };
  } catch (error) {
    console.error("Table de jeu SWU :", error);
    return { ok: false };
  }
}

/** Une table en ligne de Star Wars: Unlimited : toujours un duel (format Premier). */
export async function createSwuTableAction(choice: unknown): Promise<PlayResult<{ id: string }>> {
  return createTableFor(GAME_SLUG, "duel", choice);
}

export async function joinSwuTableAction(id: unknown, choice: unknown): Promise<PlayResult> {
  return joinTableFor(GAME_SLUG, id, choice);
}

export async function addSwuBotAction(id: unknown, level: unknown): Promise<PlayResult> {
  return addBotFor(GAME_SLUG, id, level);
}

/** `name` : le nom affiché au siège visé, pour ne pas retirer quelqu'un d'autre si la salle a bougé. */
export async function leaveSwuSeatAction(id: unknown, seat: unknown, name: unknown): Promise<PlayResult> {
  return leaveSeatFor(GAME_SLUG, id, seat, name);
}

export async function startSwuTableAction(id: unknown): Promise<PlayResult> {
  return startTableFor(GAME_SLUG, id);
}

export async function readSwuTableAction(id: unknown): Promise<PlayResult<{ state: TableState }>> {
  return readTableFor(GAME_SLUG, id);
}

/**
 * Le deck d'un invité en mode hôte, donné par son lien ou son identifiant
 * Joutes. Seuls les decks que le demandeur peut voir sont lus. Le mode hôte
 * étant réservé aux abonnés Pro et Expert, cette lecture l'est aussi.
 */
export async function resolveSwuDeckAction(
  reference: unknown,
): Promise<PlayResult<{ name: string; list: SwuDeckList }>> {
  return guarded(async () => {
    const game = await playableTableGame(GAME_SLUG);
    const seated = await tableViewer();
    if (!seated) throw new TableFailure("UNAUTHENTICATED");
    await requireHost();
    if (typeof reference !== "string") throw new TableFailure("INVALID");
    const deckId = /[a-f0-9]{24}/i.exec(reference)?.[0];
    if (!deckId) throw new TableFailure("INVALID_DECK");
    const { deck, deckName } = await resolveSwuDeck({ kind: "deck", deckId }, seated?.userId ?? null, game.id);
    return { name: deckName, list: deck };
  });
}
