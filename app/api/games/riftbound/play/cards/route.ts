import { NextResponse } from "next/server";

import { readGameBySlugOrId } from "@/lib/db/games-cached";
import { readTableCards } from "@/lib/engine/table-cards";

/** Les cartes de la table de jeu : nom, illustration, texte. Publiques et identiques pour tous. */
export async function GET() {
  const game = await readGameBySlugOrId("riftbound");
  if (!game?.features?.play) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(await readTableCards(game.id), {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
