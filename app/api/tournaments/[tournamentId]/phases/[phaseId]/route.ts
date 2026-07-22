import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { updateTournamentPhaseSchema } from "@/lib/schemas/tournament.schema";
import {
  assertPrincipalCanRead,
  assertIsOrganizer,
  deletePhase,
  getPhaseById,
  listRounds,
  requireTournament,
  TournamentError,
  updatePhase,
} from "@/lib/db/tournaments";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../../../utils";

type Params = { params: Promise<{ tournamentId: string; phaseId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, phaseId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const phase = await getPhaseById(tournamentId, phaseId);
    if (!phase) {
      throw new TournamentError("not-found", "Phase non trouvée");
    }

    const rounds = await listRounds(tournamentId, phaseId);
    return NextResponse.json({ ...phase, rounds });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, phaseId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    const body = await request.json();
    const validated = updateTournamentPhaseSchema.parse(body);

    const phase = await updatePhase(tournamentId, phaseId, validated);
    return NextResponse.json(phase);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, phaseId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    await deletePhase(tournamentId, phaseId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
