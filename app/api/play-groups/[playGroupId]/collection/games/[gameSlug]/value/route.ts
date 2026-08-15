import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlayGroupByIdAndUser, isGameEnabledForPlayGroup } from "@/lib/db/play-groups";
import { getGameBySlugOrId } from "@/lib/db/games";
import { computeGameCollectionValue } from "@/lib/db/collection-values";

/**
 * Recalcule la valeur estimée de la collection d'un groupe pour un seul jeu.
 * Ouvert à tout membre, comme la collection elle-même.
 */
export async function POST(
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
  if (!game || !isGameEnabledForPlayGroup(group, game.id)) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  try {
    const value = await computeGameCollectionValue({ type: "playGroup", id: group.id }, game.id);
    return NextResponse.json({ value });
  } catch (error) {
    console.error("Error computing play-group game collection value:", error);
    return NextResponse.json({ error: "Failed to compute collection value" }, { status: 500 });
  }
}
