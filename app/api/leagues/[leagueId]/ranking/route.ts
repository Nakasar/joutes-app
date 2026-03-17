import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getLeagueById,
  getLeagueParticipant,
  getLeagueRanking,
  isLeagueOrganizer,
} from "@/lib/db/leagues";

const DEFAULT_LIMIT = 16;
const MAX_LIMIT = 100;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await params;

    const session = await auth.api.getSession({
      headers: request.headers,
    });

    const searchParams = request.nextUrl.searchParams;
    const requestedPage = Number.parseInt(searchParams.get("page") || "1", 10);
    const requestedLimit = Number.parseInt(
      searchParams.get("limit") || String(DEFAULT_LIMIT),
      10
    );

    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, MAX_LIMIT)
        : DEFAULT_LIMIT;

    const league = await getLeagueById(leagueId);

    if (!league) {
      return NextResponse.json({ error: "Ligue introuvable" }, { status: 404 });
    }

    if (!league.isPublic) {
      const userId = session?.user?.id;

      if (!userId) {
        return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
      }

      const [participant, canManage] = await Promise.all([
        getLeagueParticipant(leagueId, userId),
        isLeagueOrganizer(leagueId, userId),
      ]);

      if (!participant && !canManage) {
        return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
      }
    }

    const ranking = await getLeagueRanking(leagueId);
    const total = ranking.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * limit;

    return NextResponse.json({
      participants: ranking.slice(start, start + limit),
      total,
      page: currentPage,
      limit,
      totalPages,
    });
  } catch (error) {
    console.error("Error fetching league ranking:", error);
    return NextResponse.json(
      { error: "Erreur lors de la recuperation du classement" },
      { status: 500 }
    );
  }
}