import { NextRequest, NextResponse } from "next/server";

import { getDeckLegendFacets } from "@/lib/db/decks";

/**
 * Légendes jouées par les decks publiés, avec leur nombre de decks.
 *
 * Alimente la combobox « Légende » de la librairie : la liste ne sort pas du
 * catalogue de cartes mais de ce qui est réellement publié — proposer trois
 * cents légendes dont aucune n'a de deck ne ferait pas un filtre.
 */
export async function GET(request: NextRequest) {
  try {
    const gameId = request.nextUrl.searchParams.get("gameId");
    const legends = await getDeckLegendFacets(gameId || undefined);

    return NextResponse.json({ legends });
  } catch (error) {
    console.error("Error fetching deck legends:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
