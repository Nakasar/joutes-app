import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { createTournamentFeatAwardSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  createFeatAward,
  listFeatAwards,
  listRounds,
  requireTournament,
  TournamentError,
} from "@/lib/db/tournaments";
import { getTournamentLeagueContext } from "@/lib/leagues/tournament-results";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../../utils";

type Params = { params: Promise<{ tournamentId: string; playerId: string }> };

// Hauts faits d'un joueur pendant le tournoi. Décernés par l'organisation comme
// par l'arbitrage : c'est à la table qu'un beau geste se constate.
export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const awards = await listFeatAwards(tournamentId, { playerId });
    return NextResponse.json(awards);
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

    const body = await request.json();
    const validated = createTournamentFeatAwardSchema.parse(body);

    // Le catalogue vit dans la ligue : c'est ici, et pas dans la couche base du
    // tournoi, qu'on vérifie que le haut fait existe — de la même façon que la
    // liaison à un événement se vérifie dans sa route.
    const context = await getTournamentLeagueContext(tournament);
    if (!context) {
      throw new TournamentError(
        "conflict",
        "Ce tournoi n'est rattaché à aucune ligue : aucun haut fait à décerner"
      );
    }
    if (!context.feats.some((feat) => feat.id === validated.featId)) {
      throw new TournamentError("invalid", "Ce haut fait ne fait pas partie de la ligue");
    }

    // Les numéros de ronde repartent à 1 à chaque phase : `createdAt` est le
    // seul ordre valable pour désigner la ronde la plus récente.
    const rounds = (await listRounds(tournamentId)).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const current =
      rounds.filter((r) => r.status === "in-progress").pop() ?? rounds[rounds.length - 1];

    const award = await createFeatAward(tournamentId, playerId, {
      featId: validated.featId,
      matchId: validated.matchId,
      roundNumber: current?.number,
      createdBy: user.userId,
    });
    return NextResponse.json(award, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
