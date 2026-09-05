import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { getGameBySlugOrId } from "@/lib/db/games";
import { addGameToUser, getUserById, removeGameFromUser } from "@/lib/db/users";

type Params = Promise<{ gameId: string }>;

/**
 * Suivre un jeu, ou cesser de le suivre — ce que le bouton de la fiche fait
 * sur le site par une action serveur, ouvert ici à un client tiers.
 *
 * Deux verbes idempotents plutôt qu'une bascule, comme pour un lieu ou un
 * joueur : deux envois partis d'un double toucher laisseraient une bascule
 * dans l'état contraire à celui voulu. `$addToSet` et `$pull` en base le sont
 * déjà.
 *
 * Le jeu se désigne par son identifiant ou son slug, comme partout sous
 * `/games`. Cesser de suivre retire aussi le favori : un favori orphelin
 * resterait invisible et intouchable.
 */
async function setFollowing(request: NextRequest, params: Params, following: boolean) {
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
    if (following) {
      await addGameToUser(viewer.userId, game.id);
    } else {
      await removeGameFromUser(viewer.userId, game.id);
    }

    const user = await getUserById(viewer.userId);
    const gameIds = user?.games ?? [];

    return NextResponse.json({
      gameId: game.id,
      following: gameIds.includes(game.id),
      gameIds,
    });
  } catch (error) {
    console.error("Erreur lors du suivi du jeu:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  return setFollowing(request, params, true);
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  return setFollowing(request, params, false);
}
