import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { readGameBySlugOrId } from "@/lib/db/games-cached";
import { listCompanionDecks } from "@/lib/companion/decks";
import { isCompanionGame } from "@/lib/companion/state";

/**
 * Les decks du joueur connecté, réduits à ce que le compagnon de partie pose
 * sur la table (légende et champs de bataille, leader et base, commandant).
 * Sans compte, la liste est vide : le compagnon se passe très bien de decks.
 */
export async function GET(request: NextRequest) {
  const game = request.nextUrl.searchParams.get("game");
  if (!isCompanionGame(game)) {
    return NextResponse.json({ error: "Jeu inconnu" }, { status: 400 });
  }

  try {
    // Session du site ou de l'app mobile, ou clé API.
    const user = await authenticateApiRequest(request);
    if (!user) {
      return NextResponse.json({ decks: [] });
    }

    const gameDoc = await readGameBySlugOrId(game);
    if (!gameDoc) {
      return NextResponse.json({ decks: [] });
    }

    const decks = await listCompanionDecks(game, gameDoc.id, user.userId);
    return NextResponse.json({ decks });
  } catch (error) {
    console.error("Compagnon : lecture des decks", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
