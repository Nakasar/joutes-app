import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { updateTournamentMatchSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanReadTournament,
  assertIsOrganizer,
  confirmMatchResult,
  deleteMatch,
  disputeMatchResult,
  getMatchById,
  reportMatchResult,
  requireTournament,
  TournamentError,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../utils";

type Params = { params: Promise<{ tournamentId: string; matchId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, matchId } = await params;
    const tournament = await requireTournament(tournamentId);
    await assertCanReadTournament(tournament, user.userId);

    const match = await getMatchById(tournamentId, matchId);
    if (!match) {
      throw new TournamentError("not-found", "Match non trouvé");
    }
    return NextResponse.json(match);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/**
 * Opérations sur un match, choisies par le champ `action` du body :
 * - `report` : rapporter un score (organisateur, ou joueur du match si le
 *   self-reporting est activé ; passe en attente de confirmation si le
 *   tournoi l'exige).
 * - `confirm` : confirmer le score rapporté par l'adversaire.
 * - `dispute` : contester le résultat.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, matchId } = await params;
    const tournament = await requireTournament(tournamentId);
    await assertCanReadTournament(tournament, user.userId);

    const body = await request.json();
    const validated = updateTournamentMatchSchema.parse(body);

    let match;
    if (validated.action === "report") {
      match = await reportMatchResult(
        tournament,
        matchId,
        { player1Score: validated.player1Score, player2Score: validated.player2Score },
        user.userId
      );
    } else if (validated.action === "confirm") {
      match = await confirmMatchResult(tournament, matchId, user.userId);
    } else {
      match = await disputeMatchResult(tournament, matchId, user.userId);
    }

    return NextResponse.json(match);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, matchId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    await deleteMatch(tournamentId, matchId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
