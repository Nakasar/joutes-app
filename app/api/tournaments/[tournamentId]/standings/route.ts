import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import {
  assertCanReadTournament,
  getStandings,
  requireTournament,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

/**
 * Classement du tournoi, calculé sur les matchs terminés. Passer `?phaseId=`
 * pour restreindre le classement à une seule phase.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    await assertCanReadTournament(tournament, user.userId);

    const phaseId = new URL(request.url).searchParams.get("phaseId") ?? undefined;
    const standings = await getStandings(tournamentId, phaseId);
    return NextResponse.json(standings);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
