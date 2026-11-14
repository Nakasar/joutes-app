import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getGameTable } from "@/lib/db/game-tables";
import { readGameBySlugOrId } from "@/lib/db/games-cached";
import {
  addBot,
  createTable,
  isBotLevel,
  isEngineMode,
  joinTable,
  leaveSeat,
  reconcileTable,
  startTable,
  summarize,
  tableAccess,
  TableFailure,
  type DeckChoice,
  type Seated,
  type TableAccess,
  type TableError,
  type TableGame,
} from "@/lib/engine/tables";
import { hasEntitlement } from "@/lib/subscriptions/access";
import type { GameTableSummary } from "@/lib/types/GameTable";

/**
 * Ce que font les actions serveur d'une table en ligne, quel que soit le jeu :
 * chaque page Jouer (`games/<jeu>/play/actions.ts`) les expose pour son jeu.
 *
 * Les échecs sortent en codes, pas en phrases : ces actions ne savent pas dans
 * quelle langue la page est rendue. `details` porte les refus du moteur pour un
 * deck, qui eux n'existent qu'en français pour l'instant.
 */
export type PlayResult<T = object> = ({ ok: true } & T) | { ok: false; error: TableError; details?: string[] };

export type TableState = {
  table: GameTableSummary;
  /** Mon siège à cette table, ou `null` si je n'y suis pas assis. */
  seat: number | null;
  isHost: boolean;
  signedIn: boolean;
  /** L'entrée à la partie, une fois lancée. Un visiteur entre en spectateur. */
  access: TableAccess | null;
};

export async function viewer(): Promise<Seated | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user?.id) return null;
  const displayName = (user as { displayName?: string }).displayName;
  return { userId: user.id, name: (displayName || user.name || "Joueur").slice(0, 40) };
}

export async function requireViewer(): Promise<Seated> {
  const seated = await viewer();
  if (!seated) throw new TableFailure("UNAUTHENTICATED");
  return seated;
}

/**
 * Ce que l'abonnement de la personne ouvre dans les pages Jouer. Le lobby s'en
 * sert pour proposer une offre plutôt qu'un bouton qui échouerait ; le vrai
 * contrôle reste dans chaque action (`requireHost`, `simulation-actions.ts`).
 *
 * - `canHost` : créer une partie en ligne en tant qu'hôte, table Joutes ou
 *   « Mon serveur » — Joutes Pro ou Joutes Expert (`sub:play-host`) ;
 * - `canSimulate` : l'écran « Simuler un deck » — Joutes Expert (`sub:play-simulate`).
 *
 * Rejoindre une table, jouer contre l'IA et regarder des IA restent libres.
 */
export type PlayAccess = { canHost: boolean; canSimulate: boolean };

export async function playAccess(): Promise<PlayAccess> {
  const [canHost, canSimulate] = await Promise.all([hasEntitlement("sub:play-host"), hasEntitlement("sub:play-simulate")]);
  return { canHost, canSimulate };
}

/** Héberger une partie en ligne : réservé à Joutes Pro et Joutes Expert. */
export async function requireHost(): Promise<void> {
  if (!(await hasEntitlement("sub:play-host"))) throw new TableFailure("SUBSCRIPTION");
}

/** Le jeu, s'il est ouvert au jeu en ligne (fonctionnalité « Jouer »). */
export async function playableGame(slug: string): Promise<TableGame> {
  const game = await readGameBySlugOrId(slug);
  if (!game?.features?.play) throw new TableFailure("NOT_FOUND");
  return { id: game.id, slug: game.slug ?? slug };
}

export async function guarded<T extends object>(run: () => Promise<T>): Promise<PlayResult<T>> {
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

export function parseChoice(choice: unknown): DeckChoice {
  const value = choice as { kind?: unknown; deckId?: unknown; legend?: unknown } | null;
  if (value?.kind === "deck" && typeof value.deckId === "string") {
    return { kind: "deck", deckId: value.deckId };
  }
  if (value?.kind === "auto" && typeof value.legend === "string") {
    return { kind: "auto", legend: value.legend };
  }
  throw new TableFailure("INVALID");
}

export function parseTableId(id: unknown): string {
  if (typeof id !== "string" || !/^[a-z0-9]{4,32}$/.test(id)) throw new TableFailure("NOT_FOUND");
  return id;
}

/** La table, si elle est bien une table de ce jeu : une autre page de jeu ne la connaît pas. */
async function tableOf(id: unknown, game: TableGame) {
  const stored = await getGameTable(parseTableId(id));
  if (!stored || stored.gameSlug !== game.slug) throw new TableFailure("NOT_FOUND");
  return stored;
}

export function createTableFor(slug: string, mode: unknown, choice: unknown): Promise<PlayResult<{ id: string }>> {
  return guarded(async () => {
    const game = await playableGame(slug);
    const seated = await requireViewer();
    await requireHost();
    if (!isEngineMode(mode)) throw new TableFailure("INVALID");
    const table = await createTable(seated, mode, parseChoice(choice), game);
    return { id: table.id };
  });
}

export function joinTableFor(slug: string, id: unknown, choice: unknown): Promise<PlayResult> {
  return guarded(async () => {
    const game = await playableGame(slug);
    const seated = await requireViewer();
    await joinTable(seated, parseTableId(id), parseChoice(choice), game);
    return {};
  });
}

export function addBotFor(slug: string, id: unknown, level: unknown): Promise<PlayResult> {
  return guarded(async () => {
    const game = await playableGame(slug);
    const seated = await requireViewer();
    if (!isBotLevel(level)) throw new TableFailure("INVALID");
    await addBot(seated.userId, (await tableOf(id, game)).id, level);
    return {};
  });
}

/** `name` : le nom affiché au siège visé, pour ne pas retirer quelqu'un d'autre si la salle a bougé. */
export function leaveSeatFor(slug: string, id: unknown, seat: unknown, name: unknown): Promise<PlayResult> {
  return guarded(async () => {
    const game = await playableGame(slug);
    const seated = await requireViewer();
    if (typeof seat !== "number" || !Number.isInteger(seat) || typeof name !== "string") {
      throw new TableFailure("INVALID");
    }
    await leaveSeat(seated.userId, (await tableOf(id, game)).id, seat, name);
    return {};
  });
}

export function startTableFor(slug: string, id: unknown): Promise<PlayResult> {
  return guarded(async () => {
    const game = await playableGame(slug);
    const seated = await requireViewer();
    await startTable(seated.userId, (await tableOf(id, game)).id);
    return {};
  });
}

export function readTableFor(slug: string, id: unknown): Promise<PlayResult<{ state: TableState }>> {
  return guarded(async () => {
    const game = await playableGame(slug);
    const seated = await viewer();
    const table = await reconcileTable(await tableOf(id, game));
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
