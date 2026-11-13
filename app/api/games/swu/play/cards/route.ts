import { NextResponse } from "next/server";

import { readGameBySlugOrId } from "@/lib/db/games-cached";
import { readSwuTableCards } from "@/lib/engine/swu/table-cards";

/** Les cartes de la table Star Wars: Unlimited : nom, illustration, texte. Publiques et identiques pour tous. */
export async function GET() {
  const game = await readGameBySlugOrId("swu");
  if (!game?.features?.play) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(await readSwuTableCards(game.id), {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
