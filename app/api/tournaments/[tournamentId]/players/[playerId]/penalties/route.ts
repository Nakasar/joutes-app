import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { createTournamentPenaltySchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  createPenalty,
  getPlayerById,
  listPenalties,
  listRounds,
  recordActivity,
  requireTournament,
  TournamentError,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../../utils";

type Params = { params: Promise<{ tournamentId: string; playerId: string }> };

// Pénalités d'un joueur. Réservé au staff : les sanctions ne sont pas
// publiques, le joueur concerné les voit via son portail (non implémenté ici).
export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const penalties = await listPenalties(tournamentId, playerId);
    return NextResponse.json(penalties);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
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

    const body = await request.json();
    const validated = createTournamentPenaltySchema.parse(body);

    // Rattache la sanction à la ronde en cours quand il y en a une, pour la
    // situer dans le déroulé du tournoi. Les numéros de ronde repartent à 1 à
    // chaque phase : c'est `createdAt` qui ordonne les rondes entre elles.
    const rounds = (await listRounds(tournamentId)).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const current = rounds.filter((r) => r.status === "in-progress").pop() ?? rounds[rounds.length - 1];

    const penalty = await createPenalty(tournamentId, playerId, {
      type: validated.type,
      reason: validated.reason,
      roundId: current?.id,
      roundNumber: current?.number,
      createdBy: user.userId,
    });
    await recordActivity(tournamentId, "penalty-issued", {
      player: player.displayName,
      type: validated.type,
    });
    return NextResponse.json(penalty, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
