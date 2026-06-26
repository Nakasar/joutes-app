import { NextRequest, NextResponse } from "next/server";
import { searchDecks, createDeck } from "@/lib/db/decks";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { deckSchema } from "@/lib/schemas/deck.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    const { searchParams } = new URL(request.url);

    const playerId = searchParams.get("playerId");
    const gameId = searchParams.get("gameId");
    const visibility = searchParams.get("visibility") as "private" | "public" | null;
    const search = searchParams.get("search");
    const sortBy = searchParams.get("sortBy") as "name" | "createdAt" | "updatedAt" | null;
    const sortOrder = searchParams.get("sortOrder") as "asc" | "desc" | null;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const scope = searchParams.get("scope") as "mine" | "all" | null;
    const favoritesOnly = searchParams.get("favoritesOnly") === "true";

    // Si on demande les decks privés d'un joueur, il faut être ce joueur
    if (visibility === "private" && playerId && session?.user?.id !== playerId) {
      return NextResponse.json(
        { error: "Vous n'avez pas l'autorisation de voir ces decks" },
        { status: 403 }
      );
    }

    // Si aucun playerId n'est spécifié et qu'on demande private, on retourne les decks de l'utilisateur connecté
    let effectivePlayerId = playerId;
    if (!playerId && visibility === "private" && session?.user?.id) {
      effectivePlayerId = session.user.id;
    }

    // Si on ne spécifie pas de playerId et pas de visibilité, on ne retourne que les decks publics
    let effectiveVisibility = visibility;
    if (!effectivePlayerId && !visibility && !scope) {
      effectiveVisibility = "public";
    }

    const result = await searchDecks({
      playerId: effectivePlayerId || undefined,
      gameId: gameId || undefined,
      visibility: effectiveVisibility || undefined,
      search: search || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined,
      page,
      limit,
      scope: scope || undefined,
      viewerId: session?.user?.id,
      favoritesOnly,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching decks:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des decks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();

    const validationResult = deckSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0]?.message || "Données invalides" },
        { status: 400 }
      );
    }

    const deckData = validationResult.data;

    const deck = await createDeck({
      playerId: session.user.id,
      gameId: deckData.gameId,
      name: deckData.name,
      url: deckData.url,
      description: deckData.description,
      visibility: deckData.visibility,
    });

    revalidatePath("/decks");
    return NextResponse.json(deck, { status: 201 });
  } catch (error) {
    console.error("Error creating deck:", error);
    if (error instanceof Error && error.message.includes("existe déjà")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
