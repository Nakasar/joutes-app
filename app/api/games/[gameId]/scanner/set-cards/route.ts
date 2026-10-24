import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getScannerCardsBySet } from "@/lib/db/cards";

/**
 * Cartes d'une extension pour le scanner d'un booster : il les reconnaît en
 * mémoire, sans appeler le serveur à chaque image.
 */
export async function GET(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: { message: "Game not found" } }, { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const setCode = searchParams.get("setCode");
  const lang = searchParams.get("lang") || undefined;

  if (!setCode) {
    return NextResponse.json({ error: { message: "Missing setCode." } }, { status: 400 });
  }

  const cards = await getScannerCardsBySet(new ObjectId(game.id), setCode, lang);

  return NextResponse.json({ cards });
}
