import { NextRequest, NextResponse } from "next/server";
import { searchLairs } from "@/lib/db/lairs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "100");

    const result = await searchLairs({
      gameIds: gameId ? [gameId] : undefined,
      search: search || undefined,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching lairs:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des lieux" },
      { status: 500 }
    );
  }
}

