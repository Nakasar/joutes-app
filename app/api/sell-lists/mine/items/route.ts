import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { addSellListItem, getOrCreateSellListForOwner } from "@/lib/db/sell-lists";
import { sellListItemSchema } from "@/lib/schemas/sell-list.schema";
import { getGameBySlugOrId } from "@/lib/db/games";

/**
 * Lists one of the current user's owned physical copies for sale, creating
 * their sell list on first use. Used by CollectionManager's "Mettre en vente" action.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const validationResult = sellListItemSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: validationResult.error.issues[0]?.message || "Données invalides" },
      { status: 400 }
    );
  }

  const { gameSlug, ...item } = validationResult.data;
  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    return NextResponse.json({ error: "Jeu introuvable" }, { status: 404 });
  }

  const owner = { type: "user" as const, id: session.user.id };

  try {
    const sellList = await getOrCreateSellListForOwner(owner);
    const created = await addSellListItem(
      sellList.id,
      owner,
      { ...item, gameId: game.id, gameName: game.name, gameSlug: game.slug },
      session.user.id
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error adding sell-list item:", error);
    if (error instanceof Error && error.message.includes("déjà en vente")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message.includes("ne fait pas partie")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
