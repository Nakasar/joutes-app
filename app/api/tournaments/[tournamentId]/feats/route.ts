import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { assertCanManage, listFeatAwards, requireTournament } from "@/lib/db/tournaments";
import { getTournamentLeagueContext } from "@/lib/leagues/tournament-results";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * Catalogue de hauts faits du tournoi et attributions déjà faites. Le catalogue
 * appartient à la ligue rattachée : sans ligue, il n'y a rien à décerner, et la
 * réponse le dit plutôt que d'échouer — l'interface s'en sert pour masquer les
 * boutons.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const context = await getTournamentLeagueContext(tournament);
    if (!context) {
      return NextResponse.json({ leagueId: null, leagueName: null, feats: [], awards: [] });
    }

    const awards = await listFeatAwards(tournamentId);
    return NextResponse.json({ ...context, awards });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
