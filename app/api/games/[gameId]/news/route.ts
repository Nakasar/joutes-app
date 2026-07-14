import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getNews } from "@/lib/db/news";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: "Jeu introuvable" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limitRaw = parseInt(searchParams.get("limit") ?? "10", 10);
  const limit = !isNaN(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;

  if (isNaN(page) || page < 1) {
    return NextResponse.json({ error: "Paramètre page invalide" }, { status: 400 });
  }

  const result = await getNews({
    gameId: game.id,
    page,
    limit,
    userId: session?.user?.id,
  });

  return NextResponse.json(result);
}
