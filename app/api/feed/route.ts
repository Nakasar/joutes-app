import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";
import { getAllGames } from "@/lib/db/games";
import { MAX_FIL, MAX_FIL_API } from "@/lib/home/constants";
import {
  findGame,
  readGameScope,
  readHomeAgenda,
  readHomeDecks,
  readHomeFeed,
  readHomeGames,
  readHomeLairs,
  readHomeLives,
  readPosition,
} from "@/lib/home/read";
import type { Deck } from "@/lib/types/Deck";

const LANGS = new Set(["fr", "en", "de", "it"]);

/**
 * L'accueil, en une réponse — ce que le site compose en six tuiles, servi à
 * l'application mobile telle quelle : les jeux de la barre, les directs, les
 * sept prochains jours, le fil, les lieux et les decks.
 *
 * Une seule route plutôt que six : un téléphone paie chaque aller-retour, et
 * toutes les tuiles partagent la même session, la même position et le même
 * jeu choisi. Les lectures sont celles de la page (`lib/home/read.ts`), si
 * bien que le téléphone et le site ne peuvent pas montrer deux accueils.
 *
 * La session est facultative : un visiteur lit tout — c'est par le fil qu'on
 * découvre — et les lieux autour de la position qu'il donne, s'il en donne.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const viewer = session?.user?.id ? await getUserById(session.user.id) : null;

    const allGames = await getAllGames();
    const requestedGame = searchParams.get("gameId");
    const game = findGame(allGames, requestedGame);
    if (requestedGame && !game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const position = readPosition(
      {
        lat: searchParams.get("lat"),
        lon: searchParams.get("lon"),
        radius: searchParams.get("radius"),
        name: searchParams.get("place"),
      },
      viewer,
    );

    const langParam = searchParams.get("lang") ?? "fr";
    const lang = LANGS.has(langParam) ? langParam : "fr";

    const limitRaw = Number.parseInt(searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_FIL_API) : MAX_FIL;

    const gameIds = readGameScope(viewer, game);

    const [lairs, agenda, feed, decks] = await Promise.all([
      readHomeLairs(viewer, position),
      readHomeAgenda(viewer, position, game),
      readHomeFeed(gameIds, lang, limit),
      readHomeDecks(viewer, game),
    ]);
    const lives = await readHomeLives(viewer, lairs.lairs, allGames);

    return NextResponse.json({
      games: readHomeGames(viewer, allGames),
      game: game ? { id: game.id, name: game.name, slug: game.slug ?? null } : null,
      position: position
        ? { latitude: position.latitude, longitude: position.longitude, radiusKm: position.radiusKm, name: position.name }
        : null,
      lives,
      agenda,
      feed,
      lairs,
      decks: { source: decks.source, decks: decks.decks.map((deck) => withoutNotes(deck, viewer?.id)) },
    });
  } catch (error) {
    console.error("Erreur lors de la composition de l'accueil:", error);
    return NextResponse.json({ error: "Erreur lors de la lecture de l'accueil" }, { status: 500 });
  }
}

/** Les notes d'un deck ne se servent qu'à son auteur — même règle que `GET /decks`. */
function withoutNotes(deck: Deck, viewerId: string | undefined): Deck {
  if (deck.playerId === viewerId) return deck;
  const { notes: _notes, ...rest } = deck;
  void _notes;
  return rest as Deck;
}
