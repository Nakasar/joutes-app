import { NextRequest, NextResponse } from "next/server";
import {
  assertPrincipalCanRead,
  getStandings,
  requireTournament,
} from "@/lib/db/tournaments";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../../utils";

/**
 * Classement du tournoi, calculé sur les matchs terminés. Passer `?phaseId=`
 * pour restreindre le classement à une seule phase.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  try {
    const { tournamentId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const phaseId = new URL(request.url).searchParams.get("phaseId") ?? undefined;
    const standings = await getStandings(tournamentId, phaseId);
    return NextResponse.json(standings);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
