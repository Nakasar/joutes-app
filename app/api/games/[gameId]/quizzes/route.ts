import { NextRequest, NextResponse } from "next/server";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getQuizzes } from "@/lib/db/quizzes";

export async function GET(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: "Jeu introuvable" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limitRaw = parseInt(searchParams.get("limit") ?? "10", 10);
  const limit = !isNaN(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;

  if (isNaN(page) || page < 1) {
    return NextResponse.json({ error: "Paramètre page invalide" }, { status: 400 });
  }

  const result = await getQuizzes({ gameId: game.id, page, limit });
  return NextResponse.json(result);
}
