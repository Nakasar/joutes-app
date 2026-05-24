import {NextRequest, NextResponse} from "next/server";
import {getGameBySlugOrId} from "@/lib/db/games";

export async function GET(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  return NextResponse.json(game);
}