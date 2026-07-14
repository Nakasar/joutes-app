import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getCardVariants } from "@/lib/db/collection";
import { getGameBySlugOrId } from "@/lib/db/games";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playGroupId: string; gameSlug: string }> }
) {
  const { playGroupId, gameSlug } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "missing name in query" }, { status: 400 });
  }

  try {
    const variants = await getCardVariants({ owner: { type: "playGroup", id: group.id }, gameId: game.id, name });
    return NextResponse.json(variants);
  } catch (error) {
    console.error("Error fetching play-group card variants:", error);
    return NextResponse.json({ error: "Failed to fetch card variants" }, { status: 500 });
  }
}
