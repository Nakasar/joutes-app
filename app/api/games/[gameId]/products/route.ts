import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getGameProductFacets } from "@/lib/db/products";
import { getProductCollection } from "@/lib/db/products-collection";
import { parseCardSearchCriteria } from "@/lib/cards/search-filters";
import { resolveEdition } from "@/lib/constants/product-editions";

/**
 * Catalogue public des produits d'un jeu — consultable sans compte, comme la
 * galerie de cartes. La possession, elle, passe par
 * `/api/collection/games/[gameSlug]/products`, qui exige une session.
 *
 * Les deux routes lisent le catalogue par la même fonction, sans propriétaire
 * ici : filtres, éditions et syntaxe de recherche se comportent donc à
 * l'identique, et une correction sur l'une profite à l'autre.
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

  const containersParam = searchParams.get("containers");
  const containers = containersParam === "true" ? true : containersParam === "false" ? false : undefined;

  try {
    // Relevées avant les critères : elles disent quelles clés et quelles valeurs
    // le jeu porte, et tout ce qui n'en fait pas partie est écarté.
    const facets = await getGameProductFacets(new ObjectId(game.id));
    const criteria = parseCardSearchCriteria(searchParams, facets);

    const result = await getProductCollection({
      owner: null,
      gameId: game.id,
      setCode,
      kind,
      edition,
      search,
      criteria,
      facets,
      containers,
      page,
      limit,
    });

    return NextResponse.json({ ...result, game: { id: game.id, name: game.name, slug: game.slug } });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
