import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { addTournamentPlayerSchema } from "@/lib/schemas/tournament.schema";
import {
  addPlayer,
  assertCanReadTournament,
  assertIsOrganizer,
  listPlayers,
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

    const players = await listPlayers(tournamentId);
    return NextResponse.json(players);
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
    const validated = addTournamentPlayerSchema.parse(body);

    const player = await addPlayer(tournamentId, { ...validated, addedBy: user.userId });
    return NextResponse.json(player, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
