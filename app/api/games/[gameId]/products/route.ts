import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getGameProductSetCodes } from "@/lib/db/products";
import db from "@/lib/mongodb";
import { productSearchFilter } from "@/lib/collection/search";

/**
 * Catalogue public des produits d'un jeu — consultable sans compte, comme la
 * galerie de cartes. La possession, elle, passe par
 * `/api/collection/games/[gameSlug]/products`, qui exige une session.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (!game.features?.products) {
    return NextResponse.json({ error: "Products are not enabled for this game" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.max(1, Math.min(96, parseInt(searchParams.get("limit") || "48", 10) || 48));
  const setCode = searchParams.get("setCode") || undefined;
  const kind = searchParams.get("kind") || undefined;
  const search = searchParams.get("search") || undefined;

  const gameObjId = new ObjectId(game.id);
  const match: Record<string, unknown> = { gameId: gameObjId };
  if (setCode && setCode !== "all") match.setCode = setCode;
  if (kind && kind !== "all") match.kind = kind;

  const searchFilter = productSearchFilter(search);
  if (searchFilter) Object.assign(match, searchFilter);

  try {
    const [total, docs, setCodes] = await Promise.all([
      db.collection("products").countDocuments(match),
      db
        .collection("products")
        .find(match, { projection: { _id: 0, id: 1, name: 1, kind: 1, setCode: 1, image: 1, contents: 1 } })
        .sort({ setCode: 1, name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      getGameProductSetCodes(gameObjId),
    ]);

    return NextResponse.json({
      items: docs,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      setCodes,
      game: { id: game.id, name: game.name, slug: game.slug },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
