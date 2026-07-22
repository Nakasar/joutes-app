import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { addTournamentPlayerSchema } from "@/lib/schemas/tournament.schema";
import {
  addPlayerByIdentifier,
  assertIsOrganizer,
  assertPrincipalCanRead,
  listPlayers,
  principalIsOrganizer,
  requireTournament,
  sanitizePlayer,
} from "@/lib/db/tournaments";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../../utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  try {
    const { tournamentId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const players = await listPlayers(tournamentId);
    const organizer = principalIsOrganizer(tournament, principal);
    return NextResponse.json(organizer ? players : players.map(sanitizePlayer));
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

    const player = await addPlayerByIdentifier(tournamentId, { ...validated, addedBy: user.userId });
    return NextResponse.json(player, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
