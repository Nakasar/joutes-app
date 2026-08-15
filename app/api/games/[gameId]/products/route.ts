import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getGameProductEditions, getGameProductSetCodes } from "@/lib/db/products";
import { PRODUCT_EDITION_FIELD, editionFilter, editionOf, resolveEdition } from "@/lib/constants/product-editions";
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
  // « Par défaut, la dernière édition » est tranché ici plutôt que par l'écran :
  // le site, l'application mobile et les agents lisent la même route.
  const edition = resolveEdition(searchParams.get("edition") || undefined, game.currentProductEdition);

  const gameObjId = new ObjectId(game.id);
  const match: Record<string, unknown> = { gameId: gameObjId, ...editionFilter(edition) };
  if (setCode && setCode !== "all") match.setCode = setCode;
  if (kind && kind !== "all") match.kind = kind;

  const searchFilter = productSearchFilter(search);
  if (searchFilter) Object.assign(match, searchFilter);

  try {
    const [total, docs, setCodes, editionCensus] = await Promise.all([
      db.collection("products").countDocuments(match),
      db
        .collection("products")
        .find(match, {
          // Seule l'édition est lue : ramener tous les attributs d'un produit
          // gonflerait chaque page sans que rien ne s'en serve.
          projection: { _id: 0, id: 1, name: 1, kind: 1, setCode: 1, image: 1, contents: 1, [PRODUCT_EDITION_FIELD]: 1 },
        })
        .sort({ setCode: 1, name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      getGameProductSetCodes(gameObjId),
      getGameProductEditions(gameObjId),
    ]);

    return NextResponse.json({
      // L'édition remonte à plat : la tuile l'affiche, elle n'a que faire du
      // reste des attributs.
      items: docs.map(({ attributes, ...doc }) => ({ ...doc, edition: editionOf(attributes) })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      setCodes,
      editions: editionCensus.editions.map((row) => row.edition),
      game: { id: game.id, name: game.name, slug: game.slug },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
