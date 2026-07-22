import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { updateTournamentPlayerSchema } from "@/lib/schemas/tournament.schema";
import {
  assertIsOrganizer,
  assertPrincipalCanRead,
  getPlayerById,
  principalIsOrganizer,
  removePlayer,
  requireTournament,
  sanitizePlayer,
  TournamentError,
  updatePlayer,
} from "@/lib/db/tournaments";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../../../utils";

type Params = { params: Promise<{ tournamentId: string; playerId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, playerId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const player = await getPlayerById(tournamentId, playerId);
    if (!player) {
      throw new TournamentError("not-found", "Joueur non trouvé");
    }
    const organizer = principalIsOrganizer(tournament, principal);
    return NextResponse.json(organizer ? player : sanitizePlayer(player));
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    const body = await request.json();
    const validated = updateTournamentPlayerSchema.parse(body);

    const player = await updatePlayer(tournamentId, playerId, validated);
    return NextResponse.json(player);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    await removePlayer(tournamentId, playerId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
