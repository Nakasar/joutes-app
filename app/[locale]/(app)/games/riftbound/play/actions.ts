"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth.ts";
import { getDecksByIds, searchDecks } from "@/lib/db/decks.ts";
import { listPlayGroupDecksOfGroups } from "@/lib/db/play-group-decks.ts";
import { getPlayGroupsForUser } from "@/lib/db/play-groups.ts";
import { getGameTable, listGameTablesOf } from "@/lib/db/game-tables.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { toEngineDeck } from "@/lib/engine/deck.ts";
import { engineTags, validateEngineDeck } from "@/lib/engine/server.ts";
import {
  addBot,
  autoDeckLegends,
  createTable,
  engineServer,
  isBotLevel,
  isEngineMode,
  joinTable,
  leaveSeat,
  reconcileTable,
  resolveDeck,
  startTable,
  summarize,
  tableAccess,
  TableFailure,
  type DeckChoice,
  type Seated,
  type TableAccess,
  type TableError,
} from "@/lib/engine/tables.ts";
import type { EngineDeckList } from "@/lib/engine/types.ts";
import type { Deck } from "@/lib/types/Deck.ts";
import type { GameTableSummary } from "@/lib/types/GameTable.ts";

/**
 * Les échecs sortent en codes, pas en phrases : ces actions ne savent pas dans
 * quelle langue la page est rendue. `details` porte les refus du moteur pour un
 * deck, qui eux n'existent qu'en français pour l'instant.
 */
export type PlayResult<T = object> = ({ ok: true } & T) | { ok: false; error: TableError; details?: string[] };

/** D'où vient un deck proposé à la table : à moi, partagé dans un de mes groupes, ou public. */
export type LobbyDeckSource = "mine" | "shared" | "public";

export type LobbyDeck = {
  id: string;
  name: string;
  source: LobbyDeckSource;
  /** Code moteur de la légende, pour la vignette. */
  legend: string | null;
  /** Le nom de la légende tel que le deck le range, pour la recherche. */
  legendName?: string;
  domains?: string[];
  /** L'auteur, pour un deck qui n'est pas à moi. */
  author?: string;
  /** Les groupes où le deck m'est partagé. */
  groups?: string[];
  favorites?: number;
  /** ISO 8601. */
  updatedAt?: string;
  /** Absente si le deck ne peut pas être joué ; `problems` dit pourquoi. */
  list: EngineDeckList | null;
  problems: string[];
};

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

async function viewer(): Promise<Seated | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user?.id) return null;
  const displayName = (user as { displayName?: string }).displayName;
  return { userId: user.id, name: (displayName || user.name || "Joueur").slice(0, 40) };
}

async function playableGame(): Promise<{ id: string; slug: string }> {
  const game = await readGameBySlugOrId(GAME_SLUG);
  if (!game?.features?.play) throw new TableFailure("NOT_FOUND");
  return { id: game.id, slug: game.slug ?? GAME_SLUG };
}

async function guarded<T extends object>(run: () => Promise<T>): Promise<PlayResult<T>> {
  try {
    return { ok: true, ...(await run()) };
  } catch (error) {
    if (error instanceof TableFailure) {
      return { ok: false, error: error.code, ...(error.details.length ? { details: error.details } : {}) };
    }
    console.error("Table de jeu :", error);
    return { ok: false, error: "SERVER" };
  }
}

async function requireViewer(): Promise<Seated> {
  const seated = await viewer();
  if (!seated) throw new TableFailure("UNAUTHENTICATED");
  return seated;
}

function parseChoice(choice: unknown): DeckChoice {
  const value = choice as { kind?: unknown; deckId?: unknown; legend?: unknown } | null;
  if (value?.kind === "deck" && typeof value.deckId === "string") {
    return { kind: "deck", deckId: value.deckId };
  }
  if (value?.kind === "auto" && typeof value.legend === "string") {
    return { kind: "auto", legend: value.legend };
  }
  throw new TableFailure("INVALID");
}

function parseTableId(id: unknown): string {
  if (typeof id !== "string" || !/^[a-z0-9]{4,32}$/.test(id)) throw new TableFailure("NOT_FOUND");
  return id;
}

/** Un deck Joutes tel que la page Jouer le propose : traduit et vérifié par le moteur. */
function toLobbyDeck(deck: Deck, source: LobbyDeckSource, groups?: string[]): LobbyDeck {
  const base = {
    id: deck.id,
    name: deck.name,
    source,
    ...(deck.legendName ? { legendName: deck.legendName } : {}),
    ...(deck.domains?.length ? { domains: deck.domains } : {}),
    ...(source !== "mine" && deck.creatorName ? { author: deck.creatorName } : {}),
    ...(groups?.length ? { groups } : {}),
    ...(deck.favoritesCount ? { favorites: deck.favoritesCount } : {}),
    ...(deck.updatedAt ? { updatedAt: new Date(deck.updatedAt).toISOString() } : {}),
  };
  const { list, problems } = toEngineDeck(deck.cards, engineTags);
  if (!list) {
    return { ...base, legend: null, list: null, problems: problems.map((p) => p.kind) };
  }
  const refused = validateEngineDeck(list);
  return { ...base, legend: list.legend, list: refused.length === 0 ? list : null, problems: refused };
}

/** Combien de decks publics la page propose d'emblée, et par recherche. */
const PUBLIC_DECKS = 20;

async function publicDecks(gameId: string, viewerId: string | null, search?: string): Promise<LobbyDeck[]> {
  const { decks } = await searchDecks({
    gameId,
    scope: "public",
    ...(search ? { search } : {}),
    sortBy: "favoritesCount",
    sortOrder: "desc",
    limit: PUBLIC_DECKS + 10,
  });
  return decks
    .filter((deck) => deck.playerId !== viewerId)
    .slice(0, PUBLIC_DECKS)
    .map((deck) => toLobbyDeck(deck, "public"));
}

/** Les decks partagés dans mes groupes, sauf les miens. */
async function sharedDecks(userId: string, gameId: string): Promise<LobbyDeck[]> {
  const groups = await getPlayGroupsForUser(userId);
  const links = await listPlayGroupDecksOfGroups(
    groups.map((group) => group.id),
    gameId,
    200,
  );
  const groupName = new Map(groups.map((group) => [group.id, group.name]));
  const groupsOf = new Map<string, string[]>();
  for (const link of links) {
    if (link.ownerId === userId) continue;
    const names = groupsOf.get(link.deckId) ?? [];
    const name = groupName.get(link.playGroupId);
    if (name && !names.includes(name)) names.push(name);
    groupsOf.set(link.deckId, names);
  }
  const ids = [...groupsOf.keys()].slice(0, 100);
  const decks = await getDecksByIds(ids);
  return decks
    .filter((deck) => deck.gameId === gameId && deck.playerId !== userId)
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    .map((deck) => toLobbyDeck(deck, "shared", groupsOf.get(deck.id)));
}

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
          decks: await publicDecks(game.id, null),
          tables: [],
          legends: autoDeckLegends(),
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
      sharedDecks(seated.userId, game.id),
      publicDecks(game.id, seated.userId),
      online ? listGameTablesOf(seated.userId, 10) : Promise.resolve([]),
    ]);

    // Un deck à la fois partagé et public reste rangé avec les partagés.
    const sharedIds = new Set(shared.map((deck) => deck.id));
    return {
      lobby: {
        signedIn: true,
        name: seated.name,
        online,
        decks: [
          ...decks.map((deck) => toLobbyDeck(deck, "mine")),
          ...shared,
          ...popular.filter((deck) => !sharedIds.has(deck.id)),
        ],
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
  return guarded(async () => {
    const game = await playableGame();
    const seated = await requireViewer();
    if (!isEngineMode(mode)) throw new TableFailure("INVALID");
    const table = await createTable(seated, mode, parseChoice(choice), game);
    return { id: table.id };
  });
}

export async function joinTableAction(id: unknown, choice: unknown): Promise<PlayResult> {
  return guarded(async () => {
    const game = await playableGame();
    const seated = await requireViewer();
    await joinTable(seated, parseTableId(id), parseChoice(choice), game.id);
    return {};
  });
}

export async function addBotAction(id: unknown, level: unknown): Promise<PlayResult> {
  return guarded(async () => {
    await playableGame();
    const seated = await requireViewer();
    if (!isBotLevel(level)) throw new TableFailure("INVALID");
    await addBot(seated.userId, parseTableId(id), level);
    return {};
  });
}

/** `name` : le nom affiché au siège visé, pour ne pas retirer quelqu'un d'autre si la salle a bougé. */
export async function leaveSeatAction(id: unknown, seat: unknown, name: unknown): Promise<PlayResult> {
  return guarded(async () => {
    await playableGame();
    const seated = await requireViewer();
    if (typeof seat !== "number" || !Number.isInteger(seat) || typeof name !== "string") {
      throw new TableFailure("INVALID");
    }
    await leaveSeat(seated.userId, parseTableId(id), seat, name);
    return {};
  });
}

export async function startTableAction(id: unknown): Promise<PlayResult> {
  return guarded(async () => {
    await playableGame();
    const seated = await requireViewer();
    await startTable(seated.userId, parseTableId(id));
    return {};
  });
}

export type TableState = {
  table: GameTableSummary;
  /** Mon siège à cette table, ou `null` si je n'y suis pas assis. */
  seat: number | null;
  isHost: boolean;
  signedIn: boolean;
  /** L'entrée à la partie, une fois lancée. Un visiteur entre en spectateur. */
  access: TableAccess | null;
};

export async function readTableAction(id: unknown): Promise<PlayResult<{ state: TableState }>> {
  return guarded(async () => {
    await playableGame();
    const seated = await viewer();
    const stored = await getGameTable(parseTableId(id));
    if (!stored) throw new TableFailure("NOT_FOUND");
    const table = await reconcileTable(stored);
    const seat = seated ? table.seats.findIndex((candidate) => candidate.userId === seated.userId) : -1;
    return {
      state: {
        table: summarize(table),
        seat: seat >= 0 ? seat : null,
        isHost: seated?.userId === table.hostId,
        signedIn: seated !== null,
        access: tableAccess(table, seated),
      },
    };
  });
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
