import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getCardVariants } from "@/lib/db/collection";
import { getGameBySlugOrId } from "@/lib/db/games";

export async function GET(request: NextRequest, { params }: { params: Promise<{ gameSlug: string }> }) {
  const { gameSlug } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const variants = await getCardVariants({ owner: { type: "user", id: session.user.id }, gameId: game.id, name });
    return NextResponse.json(variants);
  } catch (error) {
    console.error("Error fetching card variants:", error);
    return NextResponse.json({ error: "Failed to fetch card variants" }, { status: 500 });
  }
}
