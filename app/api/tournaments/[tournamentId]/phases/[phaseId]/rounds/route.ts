import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import {
  assertPrincipalCanRead,
  assertIsOrganizer,
  createNextRound,
  listRounds,
  requireTournament,
} from "@/lib/db/tournaments";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../../../../utils";

type Params = { params: Promise<{ tournamentId: string; phaseId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, phaseId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const rounds = await listRounds(tournamentId, phaseId);
    return NextResponse.json(rounds);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/**
 * Crée la ronde suivante de la phase : pairings générés automatiquement pour
 * les phases swiss/bracket (avec BYE auto-complétés), ronde vide pour freeform.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, phaseId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    const { round, matches } = await createNextRound(tournamentId, phaseId, user.userId);
    return NextResponse.json({ ...round, matches }, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
