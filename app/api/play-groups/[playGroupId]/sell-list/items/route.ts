import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { addSellListItem, getOrCreateSellListForOwner } from "@/lib/db/sell-lists";
import { sellListItemSchema } from "@/lib/schemas/sell-list.schema";
import { getGameBySlugOrId } from "@/lib/db/games";

type Params = Promise<{ playGroupId: string }>;

/** Lists one of the group's shared collection copies for sale, creating the group's sell list on first use. */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { playGroupId } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
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

  const owner = { type: "playGroup" as const, id: group.id };

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
    console.error("Error adding play-group sell-list item:", error);
    if (error instanceof Error && error.message.includes("déjà en vente")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message.includes("ne fait pas partie")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
