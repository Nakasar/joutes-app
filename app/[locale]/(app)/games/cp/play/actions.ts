"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth.ts";
import { searchDecks } from "@/lib/db/decks.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { toCpLobbyDeck, type CpLobbyDeck } from "@/lib/engine/cyberpunk/lobby-decks.ts";
import { cpAutoLegends } from "@/lib/engine/cyberpunk/server.ts";
import { mergeLobbyDecks, publicDecks, sharedDecks } from "@/lib/engine/lobby-decks.ts";

export type { CpLobbyDeck } from "@/lib/engine/cyberpunk/lobby-decks.ts";

export type CpLobby = {
  signedIn: boolean;
  name: string | null;
  /** Mes decks, puis ceux partagés dans mes groupes, puis les publics les plus aimés. */
  decks: CpLobbyDeck[];
  /** Les Légendes (codes du moteur) autour desquelles construire un deck automatique. */
  legends: string[];
};

export type CpPlayResult<T = object> = ({ ok: true } & T) | { ok: false };

/** Le slug du jeu au catalogue de Joutes (le moteur l'appelle `cyberpunk`). */
const GAME_SLUG = "cp";

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

/** Ce dont la page Jouer de Cyberpunk TCG a besoin : les decks, vérifiés par le moteur. */
export async function loadCpLobby(): Promise<CpPlayResult<{ lobby: CpLobby }>> {
  try {
    const game = await playableGame();
    if (!game) return { ok: false };
    const seated = await viewer();
    const legends = cpAutoLegends();
    if (!seated) {
      return {
        ok: true,
        lobby: {
          signedIn: false,
          name: null,
          decks: await publicDecks(game.id, null, undefined, undefined, toCpLobbyDeck),
          legends,
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
      sharedDecks(seated.userId, game.id, toCpLobbyDeck),
      publicDecks(game.id, seated.userId, undefined, undefined, toCpLobbyDeck),
    ]);
    return {
      ok: true,
      lobby: {
        signedIn: true,
        name: seated.name,
        decks: mergeLobbyDecks(
          decks.map((deck) => toCpLobbyDeck(deck, "mine")),
          shared,
          popular,
        ),
        legends,
      },
    };
  } catch (error) {
    console.error("Table de jeu Cyberpunk :", error);
    return { ok: false };
  }
}

/** Les decks publics dont le nom ou la description contient `query`. */
export async function searchCpPlayDecksAction(query: unknown): Promise<CpPlayResult<{ decks: CpLobbyDeck[] }>> {
  try {
    const game = await playableGame();
    if (!game || typeof query !== "string") return { ok: false };
    const search = query.trim().slice(0, 80);
    if (search.length < 2) return { ok: true, decks: [] };
    const seated = await viewer();
    return { ok: true, decks: await publicDecks(game.id, seated?.userId ?? null, search, undefined, toCpLobbyDeck) };
  } catch (error) {
    console.error("Table de jeu Cyberpunk :", error);
    return { ok: false };
  }
}
