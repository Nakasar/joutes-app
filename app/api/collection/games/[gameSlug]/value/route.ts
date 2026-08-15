import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getGameBySlugOrId } from "@/lib/db/games";
import { computeGameCollectionValue } from "@/lib/db/collection-values";

/**
 * Recalcule la valeur estimée de la collection pour un seul jeu.
 *
 * Le même geste que le recalcul global, à la maille où on le regarde : on
 * revient de la boutique avec trois boosters d'un jeu, on veut savoir ce que
 * ce jeu vaut maintenant — pas réestimer les huit autres.
 */
export async function POST(request: Request, { params }: { params: Promise<{ gameSlug: string }> }) {
  const { gameSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  try {
    const value = await computeGameCollectionValue({ type: "user", id: session.user.id }, game.id);
    return NextResponse.json({ value });
  } catch (error) {
    console.error("Error computing game collection value:", error);
    return NextResponse.json({ error: "Failed to compute collection value" }, { status: 500 });
  }
}
