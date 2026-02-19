import { NextResponse } from "next/server";
import { getDeckById } from "@/lib/db/decks";

type Params = Promise<{ deckId: string }>;

export async function GET(
  request: Request,
  { params }: { params: Params }
) {
  try {
    const { deckId } = await params;
    
    const deck = await getDeckById(deckId);

    if (!deck) {
      return NextResponse.json(
        { error: "Deck non trouvé" },
        { status: 404 }
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
