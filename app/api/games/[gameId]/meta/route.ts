import { NextRequest, NextResponse } from "next/server";

import { readGameBySlugOrId } from "@/lib/db/games-cached";
import { loadMetaEventsMatches } from "@/lib/db/meta-events";
import { buildMetaAppView, readMetaAppParams } from "@/lib/meta/app-view";
import { loadMetaSample } from "@/lib/meta/load";
import { resolveMetaSettings } from "@/lib/meta/settings";

type Params = { params: Promise<{ gameId: string }> };

/**
 * La méta d'un jeu, pour l'application mobile : la vue d'ensemble de la page
 * `/games/{jeu}/meta` (légendes, domaines, cartes jouées, tournois, winrates
 * de l'extension en cours). Filtres `period`, `legend`, `domain`, `source`,
 * comme la page. Lecture publique ; 404 si la méta n'est pas ouverte.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;
    const game = await readGameBySlugOrId(gameId);
    if (!game?.features?.meta) {
      return NextResponse.json({ error: "Méta introuvable pour ce jeu" }, { status: 404 });
    }

    const settings = resolveMetaSettings(game.metaSettings);
    const [sample, events] = await Promise.all([loadMetaSample(game.id, game.slug), loadMetaEventsMatches(game.id)]);
    const view = buildMetaAppView({
      sample,
      events,
      settings,
      params: readMetaAppParams(request.nextUrl.searchParams, settings),
      now: new Date(),
    });

    return NextResponse.json(
      { game: { id: game.id, slug: game.slug ?? game.id, name: game.name }, ...view },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
    );
  } catch (error) {
    console.error("Error reading game meta:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
