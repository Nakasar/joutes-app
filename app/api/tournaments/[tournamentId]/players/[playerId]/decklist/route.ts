import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { updateTournamentDecklistSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  getPlayerById,
  requireTournament,
  TournamentError,
  updateDecklist,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../../utils";

type Params = { params: Promise<{ tournamentId: string; playerId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const player = await getPlayerById(tournamentId, playerId);
    if (!player) {
      throw new TournamentError("not-found", "Joueur non trouvé");
    }
    return NextResponse.json(player.decklist ?? null);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/**
 * Enregistre la liste de deck d'un joueur et/ou son état de vérification.
 * Modifier le contenu remet la vérification à zéro (voir `updateDecklist`).
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const body = await request.json();
    const validated = updateTournamentDecklistSchema.parse(body);

    const player = await updateDecklist(tournamentId, playerId, validated, user.userId);
    return NextResponse.json(player.decklist ?? null);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
