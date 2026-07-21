import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { createTournamentMatchSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanReadTournament,
  assertIsOrganizer,
  createMatch,
  listMatchesByRound,
  requireTournament,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../../utils";

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, roundId } = await params;
    const tournament = await requireTournament(tournamentId);
    await assertCanReadTournament(tournament, user.userId);

    const matches = await listMatchesByRound(tournamentId, roundId);
    return NextResponse.json(matches);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/**
 * Ajout manuel d'un match dans la ronde (phases freeform, ou correction par
 * un organisateur).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, roundId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    const body = await request.json();
    const validated = createTournamentMatchSchema.parse(body);

    const match = await createMatch(tournamentId, roundId, validated);
    return NextResponse.json(match, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
