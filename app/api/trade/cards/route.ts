import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { searchTradeCards, TradeCardScope } from "@/lib/db/trades";

/**
 * Recherche de cartes pour l'interface d'échange, tous jeux confondus.
 * `scope=collection` restreint aux cartes possédées, `scope=catalog` couvre
 * l'intégralité du catalogue.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const scope: TradeCardScope = searchParams.get("scope") === "catalog" ? "catalog" : "collection";
  const query = searchParams.get("q") ?? undefined;
  const gameId = searchParams.get("gameId") || undefined;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.max(1, Math.min(48, Number.parseInt(searchParams.get("limit") ?? "24", 10) || 24));

  try {
    const result = await searchTradeCards({
      userId: session.user.id,
      query,
      scope,
      gameId,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error searching trade cards:", error);
    return NextResponse.json({ error: "Failed to search cards" }, { status: 500 });
  }
}
