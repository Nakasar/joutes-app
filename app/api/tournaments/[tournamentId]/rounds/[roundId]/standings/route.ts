import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import {
  assertIsOrganizer,
  requireTournament,
  validateRoundStandings,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../../utils";

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

/**
 * Valide (ou recalcule) le classement d'une ronde : l'organisateur fige le
 * classement de la phase à l'issue de cette ronde en base, pour ne pas le
 * recalculer à chaque lecture. Idempotent : rappeler la route rafraîchit le
 * snapshot. Réservé aux organisateurs.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, roundId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    const round = await validateRoundStandings(tournamentId, roundId);
    return NextResponse.json(round);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
