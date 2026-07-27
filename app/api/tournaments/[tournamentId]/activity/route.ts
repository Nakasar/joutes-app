import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { assertCanManage, listActivity, requireTournament } from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * Journal d'activité du tournoi (fil de suivi de l'organisation). Réservé au
 * staff : il expose des noms de joueurs et le détail des actions d'arbitrage.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const limitParam = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(limitParam) ? limitParam : 30;

    const activity = await listActivity(tournamentId, limit);
    return NextResponse.json(activity);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
