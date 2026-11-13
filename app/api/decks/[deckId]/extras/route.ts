import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getDeckById } from "@/lib/db/decks";
import { getGameById } from "@/lib/db/games";
import { getDeckCardnexusOrder } from "@/lib/db/deck-cards";
import { getDeckZones } from "@/lib/decks/zones";
import { zonesForDeck } from "@/lib/decks/extra-legends";
import { readDeckAccess } from "@/lib/decks/read-access";
import { toDeckResultView } from "@/lib/decks/result-view";
import { deckIdSchema } from "@/lib/schemas/deck.schema";
import { listVisibleDeckResults } from "@/lib/tournaments/result-service";

/**
 * Ce que la fiche d'un deck montre en plus de sa liste, pour l'app mobile :
 * les résultats en tournoi liés au deck que le lecteur peut voir, et le lien
 * « Acheter le deck sur CardNexus ». Le site les calcule au rendu de la page ;
 * une route à part évite d'alourdir `GET /api/decks/{id}`, lu par toutes les
 * listes de decks.
 *
 * Chacune des deux lectures peut échouer sans fermer l'autre : la fiche
 * s'affiche, la section manque.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ deckId: string }> }) {
  try {
    const { deckId } = await params;
    if (!deckIdSchema.safeParse(deckId).success) {
      return NextResponse.json({ error: "ID de deck invalide" }, { status: 400 });
    }

    const session = await auth.api.getSession({ headers: await headers() });
    const viewerId = session?.user?.id ?? null;

    const deck = await getDeckById(deckId);
    if (!deck) {
      return NextResponse.json({ error: "Deck non trouvé" }, { status: 404 });
    }
    if (!(await readDeckAccess(deck, viewerId ?? undefined))) {
      return NextResponse.json({ error: "Vous n'avez pas l'autorisation de voir ce deck" }, { status: 403 });
    }

    const game = await getGameById(deck.gameId);
    const zones = zonesForDeck(getDeckZones(game), deck.cards);

    const [results, cardnexusOrder] = await Promise.all([
      listVisibleDeckResults(deck, viewerId)
        .then((list) => list.map((result) => toDeckResultView(result, viewerId)))
        .catch((error) => {
          console.error("Résultats du deck illisibles", error);
          return [];
        }),
      getDeckCardnexusOrder(deck, zones).catch((error) => {
        console.error("Commande CardNexus du deck illisible", error);
        return null;
      }),
    ]);

    return NextResponse.json({ results, cardnexusOrder });
  } catch (error) {
    console.error("Erreur lors de la lecture des compléments d'un deck:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
