import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getWishlistedCardIdsForUser } from "@/lib/db/wishlists";

/**
 * Ids des cartes présentes dans les wishlists de l'utilisateur connecté
 * (personnelles + groupes de jeu), pour un jeu donné (`gameSlug`). Sert à
 * afficher le cœur « déjà en wishlist » sur les tuiles de cartes.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const gameSlug = request.nextUrl.searchParams.get("gameSlug");
  if (!gameSlug) {
    return NextResponse.json({ error: "Paramètre gameSlug requis" }, { status: 400 });
  }

  try {
    const game = await getGameBySlugOrId(gameSlug);
    if (!game) {
      return NextResponse.json({ error: "Jeu non trouvé" }, { status: 404 });
    }

    const cardIds = await getWishlistedCardIdsForUser(session.user.id, game.id);
    return NextResponse.json({ cardIds });
  } catch (error) {
    console.error("Erreur lors de la récupération des cartes en wishlist:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
