import { NextResponse } from "next/server";

import { readGameBySlugOrId } from "@/lib/db/games-cached";
import { readCpTableCards } from "@/lib/engine/cyberpunk/table-cards";

/** Les cartes de la table Cyberpunk TCG : nom, illustration, texte. Publiques et identiques pour tous. */
export async function GET() {
  const game = await readGameBySlugOrId("cp");
  if (!game?.features?.play) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(await readCpTableCards(game.id), {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
