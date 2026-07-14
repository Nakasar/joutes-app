import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { addWishlistItem, getWishlistAccess, getWishlistById, getWishlistItems } from "@/lib/db/wishlists";
import { wishlistItemSchema } from "@/lib/schemas/wishlist.schema";
import { getGameBySlugOrId } from "@/lib/db/games";

type Params = Promise<{ wishlistId: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { wishlistId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const wishlist = await getWishlistById(wishlistId);
  if (!wishlist) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  const { canView } = await getWishlistAccess(wishlist, session?.user?.id);
  if (!canView) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const gameId = searchParams.get("gameId") || undefined;
  const type = searchParams.get("type") || undefined;
  const search = searchParams.get("search") || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.max(1, Math.min(96, parseInt(searchParams.get("limit") || "48", 10) || 48));
  const minOwnedParam = searchParams.get("minOwned");
  const ownedMinQuantity = minOwnedParam !== null ? Math.max(0, parseInt(minOwnedParam, 10) || 0) : undefined;

  try {
    const result = await getWishlistItems(wishlistId, {
      gameId,
      type,
      search,
      page,
      limit,
      viewerId: session?.user?.id,
      ownedMinQuantity,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching wishlist items:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { wishlistId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const wishlist = await getWishlistById(wishlistId);
  if (!wishlist) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  const { canEdit } = await getWishlistAccess(wishlist, session.user.id);
  if (!canEdit) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  const body = await request.json();
  const validationResult = wishlistItemSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: validationResult.error.issues[0]?.message || "Données invalides" },
      { status: 400 }
    );
  }

  const { gameSlug, ...card } = validationResult.data;
  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    return NextResponse.json({ error: "Jeu introuvable" }, { status: 404 });
  }

  try {
    const item = await addWishlistItem(
      wishlistId,
      { ...card, gameId: game.id, gameName: game.name, gameSlug: game.slug },
      session.user.id
    );
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Error adding wishlist item:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
