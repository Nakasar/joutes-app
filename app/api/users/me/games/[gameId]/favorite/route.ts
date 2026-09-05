import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { getGameBySlugOrId } from "@/lib/db/games";
import {
  addFavoriteGameToUser,
  getUserById,
  removeFavoriteGameFromUser,
} from "@/lib/db/users";

type Params = Promise<{ gameId: string }>;

/**
 * Mettre un jeu suivi en favori, ou l'en retirer.
 *
 * Le favori se choisit **parmi les jeux suivis** : c'est la règle de la base
 * (`addFavoriteGameToUser` ne touche pas un compte qui ne suit pas le jeu), et
 * la route la dit en 409 plutôt qu'en réussite muette — un client qui voit
 * son étoile retomber sans explication ne saurait pas quoi faire.
 */
async function setFavorite(request: NextRequest, params: Params, favorite: boolean) {
  const { gameId } = await params;
  const viewer = await authenticateApiRequest(request);
  if (!viewer) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  try {
    if (favorite) {
      const done = await addFavoriteGameToUser(viewer.userId, game.id);
      if (!done) {
        return NextResponse.json(
          { error: "Ce jeu doit d'abord faire partie de vos jeux suivis" },
          { status: 409 },
        );
      }
    } else {
      await removeFavoriteGameFromUser(viewer.userId, game.id);
    }

    const user = await getUserById(viewer.userId);
    const gameIds = user?.games ?? [];
    const favoriteGameIds = (user?.favoriteGames ?? []).filter((id) => gameIds.includes(id));

    return NextResponse.json({
      gameId: game.id,
      favorite: favoriteGameIds.includes(game.id),
      favoriteGameIds,
    });
  } catch (error) {
    console.error("Erreur lors de la mise en favori du jeu:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  return setFavorite(request, params, true);
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  return setFavorite(request, params, false);
}
