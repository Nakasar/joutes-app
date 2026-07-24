import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getWishlistIdsContainingCard } from "@/lib/db/wishlists";

/**
 * Ids des wishlists de l'utilisateur connecté (personnelles + groupes de jeu)
 * qui contiennent déjà la carte donnée (`gameSlug` + `cardId`). Sert à cocher
 * ces listes dans le popover d'ajout à une wishlist.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const gameSlug = request.nextUrl.searchParams.get("gameSlug");
  const cardId = request.nextUrl.searchParams.get("cardId");
  if (!gameSlug || !cardId) {
    return NextResponse.json({ error: "Paramètres gameSlug et cardId requis" }, { status: 400 });
  }

  try {
    const game = await getGameBySlugOrId(gameSlug);
    if (!game) {
      return NextResponse.json({ error: "Jeu non trouvé" }, { status: 404 });
    }

    const wishlistIds = await getWishlistIdsContainingCard(session.user.id, game.id, cardId);
    return NextResponse.json({ wishlistIds });
  } catch (error) {
    console.error("Erreur lors de la recherche des wishlists contenant la carte:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
