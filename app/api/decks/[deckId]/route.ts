import { NextRequest, NextResponse } from "next/server";
import { getDeckById, updateDeck, deleteDeck } from "@/lib/db/decks";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { deckUpdateSchema, deckIdSchema } from "@/lib/schemas/deck.schema";

type Params = Promise<{ deckId: string }>;

export async function GET(
  request: Request,
  { params }: { params: Params }
) {
  try {
    const { deckId } = await params;

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    const deck = await getDeckById(deckId);

    if (!deck) {
      return NextResponse.json(
        { error: "Deck non trouvé" },
        { status: 404 }
      );
    }

    if (deck.visibility === "private" && deck.playerId !== session?.user?.id) {
      return NextResponse.json(
        { error: "Vous n'avez pas l'autorisation de voir ce deck" },
        { status: 403 }
      );
    }

    return NextResponse.json(deck);
  } catch (error) {
    console.error("Error fetching deck:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { deckId } = await params;

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const deckIdValidation = deckIdSchema.safeParse(deckId);
    if (!deckIdValidation.success) {
      return NextResponse.json({ error: "ID de deck invalide" }, { status: 400 });
    }

    const body = await request.json();

    const validationResult = deckUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0]?.message || "Données invalides" },
        { status: 400 }
      );
    }

    const deck = await updateDeck(deckId, session.user.id, validationResult.data);

    if (!deck) {
      return NextResponse.json(
        { error: "Deck non trouvé ou vous n'avez pas l'autorisation de le modifier" },
        { status: 404 }
      );
    }

    revalidatePath("/decks");
    revalidatePath(`/decks/${deckId}`);
    revalidatePath(`/decks/${deckId}/edit`);
    return NextResponse.json(deck);
  } catch (error) {
    console.error("Error updating deck:", error);
    if (error instanceof Error && error.message.includes("existe déjà")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { deckId } = await params;

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const deckIdValidation = deckIdSchema.safeParse(deckId);
    if (!deckIdValidation.success) {
      return NextResponse.json({ error: "ID de deck invalide" }, { status: 400 });
    }

    const result = await deleteDeck(deckId, session.user.id);

    if (!result) {
      return NextResponse.json(
        { error: "Deck non trouvé ou vous n'avez pas l'autorisation de le supprimer" },
        { status: 404 }
      );
    }

    revalidatePath("/decks");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting deck:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
