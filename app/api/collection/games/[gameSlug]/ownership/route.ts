import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getOwnershipByName } from "@/lib/db/collection";
import { getGameBySlugOrId } from "@/lib/db/games";

/** Un écran n'affiche qu'une poignée de cartes : au-delà, la requête est suspecte. */
const MAX_NAMES = 120;

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

  const names = request.nextUrl.searchParams.getAll("names").filter(Boolean);
  if (names.length === 0) {
    return NextResponse.json({ error: "missing names in query" }, { status: 400 });
  }
  if (names.length > MAX_NAMES) {
    return NextResponse.json({ error: `Too many names (max ${MAX_NAMES})` }, { status: 400 });
  }

  // Les cartes d'un booster déjà versé à la collection y sont comptées une
  // fois : l'appelant qui affiche ce booster les rajoute lui-même par-dessus.
  const excludeBoosterId = request.nextUrl.searchParams.get("excludeBooster") ?? undefined;

  try {
    const ownership = await getOwnershipByName(
      { type: "user", id: session.user.id },
      game.id,
      names,
      { excludeBoosterId }
    );
    return NextResponse.json({ ownership });
  } catch (error) {
    console.error("Error fetching card ownership:", error);
    return NextResponse.json({ error: "Failed to fetch card ownership" }, { status: 500 });
  }
}
