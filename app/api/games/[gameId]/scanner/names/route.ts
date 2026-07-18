import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getCardNamesBySet } from "@/lib/db/cards";

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

  const names = await getCardNamesBySet(new ObjectId(game.id), setCode, lang);

  return NextResponse.json({ names });
}
