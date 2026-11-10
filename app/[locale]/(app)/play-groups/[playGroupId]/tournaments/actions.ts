"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth.ts";
import { searchDecks } from "@/lib/db/decks.ts";
import { getPlayGroupsForUser } from "@/lib/db/play-groups.ts";
import {
  claimLocatorResult,
  declareResult,
  deleteResult,
  searchLocatorPlayers,
  searchResultTournaments,
  updateMyResult,
  type JoutesTournamentSuggestion,
  type LocatorEventSuggestion,
  type LocatorPlayerSuggestion,
  type ResultServiceError,
} from "@/lib/tournaments/result-service.ts";

import { revalidateGroupDecks } from "../decks/revalidate.ts";

/**
 * Les actions de la vue Tournois. Les règles sont dans
 * `lib/tournaments/result-service.ts`, que sert aussi la route d'API : ces
 * actions ne font qu'ouvrir la session et rafraîchir les pages. Un résultat
 * appartient au joueur, pas au groupe : il change la vue de tous ses groupes.
 */

type Failure = { success: false; error: ResultServiceError | "FAILED" };

async function readUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

async function refresh(userId: string, deckIds: (string | undefined)[] = []) {
  const groups = await getPlayGroupsForUser(userId);
  const ids = groups.map((group) => group.id);
  const decks = [...new Set(deckIds.filter((id): id is string => Boolean(id)))];
  if (decks.length === 0) {
    revalidateGroupDecks(ids);
  }
  for (const deckId of decks) {
    revalidateGroupDecks(ids, deckId);
  }
}

function failed(where: string, error: unknown): Failure {
  console.error(where, error);
  return { success: false, error: "FAILED" };
}

export async function searchResultTournamentsAction(
  query: string,
  gameId?: string,
): Promise<{ success: true; joutes: JoutesTournamentSuggestion[]; locator: LocatorEventSuggestion[] } | Failure> {
  try {
    const found = await searchResultTournaments(await readUserId(), query, gameId);
    return found.ok ? { success: true, joutes: found.joutes, locator: found.locator } : { success: false, error: found.error };
  } catch (error) {
    return failed("searchResultTournamentsAction", error);
  }
}

export async function searchLocatorPlayersAction(
  eventId: string,
  query: string,
): Promise<{ success: true; players: LocatorPlayerSuggestion[] } | Failure> {
  try {
    const found = await searchLocatorPlayers(await readUserId(), eventId, query);
    return found.ok ? { success: true, players: found.players } : { success: false, error: found.error };
  } catch (error) {
    return failed("searchLocatorPlayersAction", error);
  }
}

export type MyDeckForResult = { id: string; name: string; gameId: string; version: number; legendName?: string };

/** Mes decks, pour « Deck joué » : la version actuelle est celle qui sera retenue. */
export async function listMyDecksForResults(): Promise<{ success: true; decks: MyDeckForResult[] } | Failure> {
  try {
    const userId = await readUserId();
    if (!userId) return { success: false, error: "UNAUTHENTICATED" };
    const result = await searchDecks({ scope: "mine", viewerId: userId, sortBy: "updatedAt", sortOrder: "desc", limit: 200 });

    return {
      success: true,
      decks: result.decks
        .filter((deck) => !deck.meta?.imported)
        .map((deck) => ({
          id: deck.id,
          name: deck.name,
          gameId: deck.gameId,
          version: deck.version ?? 1,
          ...(deck.legendName ? { legendName: deck.legendName } : {}),
        })),
    };
  } catch (error) {
    return failed("listMyDecksForResults", error);
  }
}

export async function declareResultAction(input: Record<string, unknown>): Promise<{ success: true } | Failure> {
  try {
    const userId = await readUserId();
    const outcome = await declareResult(userId, input);
    if (!outcome.ok) return { success: false, error: outcome.error };
    await refresh(outcome.result.userId, [outcome.result.deckId]);

    return { success: true };
  } catch (error) {
    return failed("declareResultAction", error);
  }
}

export async function claimLocatorResultAction(input: {
  eventId: string;
  registrationId: number;
  deckId?: string;
  visibility?: string;
}): Promise<{ success: true } | Failure> {
  try {
    const userId = await readUserId();
    const outcome = await claimLocatorResult(userId, input);
    if (!outcome.ok) return { success: false, error: outcome.error };
    await refresh(outcome.result.userId, [outcome.result.deckId]);

    return { success: true };
  } catch (error) {
    return failed("claimLocatorResultAction", error);
  }
}

export async function updateMyResultAction(
  resultId: string,
  input: { deckId?: string | null; visibility?: string },
  previousDeckId?: string,
): Promise<{ success: true } | Failure> {
  try {
    const userId = await readUserId();
    const outcome = await updateMyResult(userId, resultId, input);
    if (!outcome.ok) return { success: false, error: outcome.error };
    await refresh(outcome.result.userId, [outcome.result.deckId, previousDeckId]);

    return { success: true };
  } catch (error) {
    return failed("updateMyResultAction", error);
  }
}

export async function deleteResultAction(resultId: string, deckId?: string): Promise<{ success: true } | Failure> {
  try {
    const userId = await readUserId();
    const outcome = await deleteResult(userId, resultId);
    if (!outcome.ok) return { success: false, error: outcome.error };
    if (userId) await refresh(userId, [deckId]);

    return { success: true };
  } catch (error) {
    return failed("deleteResultAction", error);
  }
}
