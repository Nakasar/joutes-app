import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { addSellListItem, getSellListAccess, getSellListById, getSellListItems } from "@/lib/db/sell-lists";
import { sellListItemSchema } from "@/lib/schemas/sell-list.schema";
import { getGameBySlugOrId } from "@/lib/db/games";

type Params = Promise<{ sellListId: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { sellListId } = await params;

  const sellList = await getSellListById(sellListId);
  if (!sellList) {
    return NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const gameId = searchParams.get("gameId") || undefined;
  const setCode = searchParams.get("setCode") || undefined;
  const type = searchParams.get("type") || undefined;
  const condition = searchParams.get("condition") || undefined;
  const foilParam = searchParams.get("foil");
  const foil = foilParam !== null ? foilParam === "true" : undefined;
  const language = searchParams.get("language") || undefined;
  const priceMinParam = searchParams.get("priceMin");
  const priceMaxParam = searchParams.get("priceMax");
  const priceMin = priceMinParam !== null ? Number(priceMinParam) : undefined;
  const priceMax = priceMaxParam !== null ? Number(priceMaxParam) : undefined;
  const search = searchParams.get("search") || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.max(1, Math.min(96, parseInt(searchParams.get("limit") || "48", 10) || 48));

  try {
    const result = await getSellListItems(sellListId, {
      gameId,
      setCode,
      type,
      condition,
      foil,
      language,
      priceMin,
      priceMax,
      search,
      page,
      limit,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching sell-list items:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { sellListId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const sellList = await getSellListById(sellListId);
  if (!sellList) {
    return NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 });
  }

  const { canEdit } = await getSellListAccess(sellList, session.user.id);
  if (!canEdit) {
    return NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 });
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

  try {
    const created = await addSellListItem(
      sellListId,
      { type: sellList.ownerType, id: sellList.ownerId },
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
