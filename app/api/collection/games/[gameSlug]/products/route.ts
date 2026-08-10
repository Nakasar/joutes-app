import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getProductCollection } from "@/lib/db/products-collection";

/**
 * Catalogue de produits d'un jeu, annoté de ce que l'utilisateur en possède.
 *
 * Une session est exigée : c'est l'écran de collection qui appelle cette route.
 * L'exploration publique du catalogue passe par `/api/games/[gameId]/products`,
 * qui rend le même catalogue sans possession.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ gameSlug: string }> }) {
  const { gameSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const game = await getGameBySlugOrId(gameSlug);
  // Un catalogue non activé n'existe pas du point de vue du client : même 404
  // que la route publique, et que les pages qui font `notFound()`.
  if (!game?.features?.products) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.max(1, Math.min(96, parseInt(searchParams.get("limit") || "48", 10) || 48));
  const setCode = searchParams.get("setCode") || undefined;
  const kind = searchParams.get("kind") || undefined;
  const search = searchParams.get("search") || undefined;

  const ownedParam = searchParams.get("owned");
  const owned = ownedParam === "true" ? true : ownedParam === "false" ? false : undefined;

  const containersParam = searchParams.get("containers");
  const containers = containersParam === "true" ? true : containersParam === "false" ? false : undefined;

  try {
    const result = await getProductCollection({
      owner: { type: "user", id: session.user.id },
      gameId: game.id,
      setCode,
      kind,
      search,
      owned,
      containers,
      page,
      limit,
    });

    return NextResponse.json({ ...result, game: { id: game.id, name: game.name, slug: game.slug } });
  } catch (error) {
    console.error("Error fetching product collection:", error);
    return NextResponse.json({ error: "Failed to fetch product collection" }, { status: 500 });
  }
}
