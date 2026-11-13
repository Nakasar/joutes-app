"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth.ts";
import { searchDecks } from "@/lib/db/decks.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { mergeLobbyDecks, publicDecks, sharedDecks } from "@/lib/engine/lobby-decks.ts";
import { swuAutoDeckCards, toSwuLobbyDeck, type SwuLobbyDeck } from "@/lib/engine/swu/lobby-decks.ts";

export type { SwuLobbyDeck } from "@/lib/engine/swu/lobby-decks.ts";

export type SwuLobby = {
  signedIn: boolean;
  name: string | null;
  /** Mes decks, puis ceux partagés dans mes groupes, puis les publics les plus aimés. */
  decks: SwuLobbyDeck[];
  /** Leaders et bases (codes du moteur) pour un deck automatique. */
  leaders: string[];
  bases: string[];
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
    if (!seated) {
      return {
        ok: true,
        lobby: {
          signedIn: false,
          name: null,
          decks: await publicDecks(game.id, null, undefined, undefined, toSwuLobbyDeck),
          ...auto,
        },
      };
    }
    const [{ decks }, shared, popular] = await Promise.all([
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
    ]);
    return {
      ok: true,
      lobby: {
        signedIn: true,
        name: seated.name,
        decks: mergeLobbyDecks(
          decks.map((deck) => toSwuLobbyDeck(deck, "mine")),
          shared,
          popular,
        ),
        ...auto,
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
