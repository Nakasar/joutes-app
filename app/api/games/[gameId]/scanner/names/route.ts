import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getAllCardNamesById } from "@/lib/db/cards";

export async function GET(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: { message: "Game not found" } }, { status: 404 });
  }

  const names = await getAllCardNamesById(new ObjectId(game.id));

  return NextResponse.json({ names });
}
