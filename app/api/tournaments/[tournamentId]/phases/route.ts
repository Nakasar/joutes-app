import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { createTournamentPhaseSchema } from "@/lib/schemas/tournament.schema";
import {
  addPhase,
  assertCanReadTournament,
  assertIsOrganizer,
  listPhases,
  requireTournament,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    await assertCanReadTournament(tournament, user.userId);

    const phases = await listPhases(tournamentId);
    return NextResponse.json(phases);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    const body = await request.json();
    const validated = createTournamentPhaseSchema.parse(body);

    const phase = await addPhase(tournamentId, validated);
    return NextResponse.json(phase, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
