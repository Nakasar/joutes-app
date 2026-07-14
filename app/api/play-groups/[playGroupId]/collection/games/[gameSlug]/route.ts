import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getGameCollection } from "@/lib/db/collection";
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

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.max(1, Math.min(96, parseInt(searchParams.get("limit") || "48", 10) || 48));
  const setCode = searchParams.get("setCode") || undefined;
  const type = searchParams.get("type") || undefined;
  const search = searchParams.get("search") || undefined;
  const ownedParam = searchParams.get("owned");
  const owned = ownedParam === "true" ? true : ownedParam === "false" ? false : undefined;

  try {
    const result = await getGameCollection({
      owner: { type: "playGroup", id: group.id },
      gameId: game.id,
      setCode,
      type,
      search,
      owned,
      page,
      limit,
    });
    return NextResponse.json({ ...result, game: { id: game.id, name: game.name, slug: game.slug } });
  } catch (error) {
    console.error("Error fetching play-group game collection:", error);
    return NextResponse.json({ error: "Failed to fetch game collection" }, { status: 500 });
  }
}
