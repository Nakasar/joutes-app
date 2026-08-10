import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getGameBySlugOrId } from "@/lib/db/games";
import { addProductToCollection } from "@/lib/db/products-collection";
import { collectionProductSchema } from "@/lib/schemas/collection.schema";

/**
 * Ajoute un exemplaire de produit à la collection de l'utilisateur, et — sauf
 * refus explicite — les figurines qu'il contient.
 *
 * Le jeu est passé en paramètre de requête plutôt que dans le corps : un
 * identifiant de produit n'est unique qu'au sein d'un jeu.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gameSlug = request.nextUrl.searchParams.get("gameSlug");
  if (!gameSlug) {
    return NextResponse.json({ error: "Missing gameSlug" }, { status: 400 });
  }

  const game = await getGameBySlugOrId(gameSlug);
  // Un catalogue non activé n'existe pas du point de vue du client : même 404
  // que la route publique, et que les pages qui font `notFound()`.
  if (!game?.features?.products) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const raw = await request.json();
  const validated = collectionProductSchema.safeParse(raw);
  if (!validated.success) {
    return NextResponse.json({ error: "Invalid product data", details: validated.error }, { status: 400 });
  }

  try {
    const result = await addProductToCollection(
      { type: "user", id: session.user.id },
      game.id,
      validated.data
    );

    if (!result) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error adding product to collection:", error);
    return NextResponse.json({ error: "Failed to add product" }, { status: 500 });
  }
}
