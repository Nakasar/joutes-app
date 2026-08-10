import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getProductDetail } from "@/lib/db/products-collection";

/**
 * Fiche d'un produit vue depuis la collection : son contenu annoté de ce qu'on
 * en possède, les exemplaires possédés, et les boîtes qui le contiennent.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gameSlug: string; productId: string }> }
) {
  const { gameSlug, productId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  try {
    const detail = await getProductDetail({ type: "user", id: session.user.id }, game.id, productId);
    if (!detail) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error("Error fetching product detail:", error);
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 });
  }
}
