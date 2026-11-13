import { NextRequest, NextResponse } from "next/server";

import { readGameBySlugOrId } from "@/lib/db/games-cached";
import { loadMetaEventsMatches } from "@/lib/db/meta-events";
import { buildMetaTournamentAppView } from "@/lib/meta/app-view";
import { loadMetaSample } from "@/lib/meta/load";

type Params = { params: Promise<{ gameId: string; date: string; slug: string }> };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Un tournoi de la méta, pour l'application mobile : ses decks par classement,
 * ses légendes et, s'il a été importé avec ses matchs, son top 8 et ses
 * winrates. Même adresse que la page `…/meta/tournois/{date}/{slug}`.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { gameId, date, slug } = await params;
    if (!DAY.test(date)) {
      return NextResponse.json({ error: "Date attendue au format AAAA-MM-JJ" }, { status: 400 });
    }
    const game = await readGameBySlugOrId(gameId);
    if (!game?.features?.meta) {
      return NextResponse.json({ error: "Méta introuvable pour ce jeu" }, { status: 404 });
    }

    const [sample, events] = await Promise.all([loadMetaSample(game.id, game.slug), loadMetaEventsMatches(game.id)]);
    const view = buildMetaTournamentAppView({ sample, events, date, slug });
    if (!view) {
      return NextResponse.json({ error: "Tournoi introuvable" }, { status: 404 });
    }

    return NextResponse.json(view, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } });
  } catch (error) {
    console.error("Error reading meta tournament:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
