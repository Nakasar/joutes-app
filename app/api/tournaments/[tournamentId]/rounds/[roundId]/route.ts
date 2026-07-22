import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import {
  assertPrincipalCanRead,
  assertIsOrganizer,
  deleteRound,
  getRoundById,
  listMatchesByRound,
  requireTournament,
  TournamentError,
} from "@/lib/db/tournaments";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../../../utils";

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, roundId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const round = await getRoundById(tournamentId, roundId);
    if (!round) {
      throw new TournamentError("not-found", "Ronde non trouvée");
    }

    const matches = await listMatchesByRound(tournamentId, roundId);
    return NextResponse.json({ ...round, matches });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, roundId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    await deleteRound(tournamentId, roundId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
