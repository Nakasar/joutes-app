import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import {
  advanceToNextPhase,
  assertIsOrganizer,
  getNextPhaseTransition,
  requireTournament,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * Aperçu du passage à la phase suivante (organisateurs) : phase courante à
 * clôturer, phase à démarrer, et qualification à l'entrée (qualifiés /
 * éliminés par le top cut).
 */
export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    const transition = await getNextPhaseTransition(tournamentId);
    return NextResponse.json(transition);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/**
 * Passe à la phase suivante (organisateurs) : clôture la phase courante,
 * élimine (DROPPED) les joueurs non qualifiés par le top cut, et crée la
 * première ronde de la nouvelle phase.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    const { round, matches } = await advanceToNextPhase(tournamentId, user.userId);
    return NextResponse.json({ ...round, matches }, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
