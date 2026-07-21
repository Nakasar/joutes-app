import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { updateTournamentSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanReadTournament,
  assertIsOrganizer,
  deleteTournament,
  listPhases,
  listPlayers,
  requireTournament,
  updateTournament,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    await assertCanReadTournament(tournament, user.userId);

    const [phases, players] = await Promise.all([
      listPhases(tournamentId),
      listPlayers(tournamentId),
    ]);

    return NextResponse.json({ ...tournament, phases, players });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    const body = await request.json();
    const validated = updateTournamentSchema.parse(body);

    const updated = await updateTournament(tournamentId, validated);
    return NextResponse.json(updated);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    await deleteTournament(tournamentId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
