import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { listPlayerTournamentsForUser, sanitizePlayer } from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../utils";

/**
 * Tournois où l'utilisateur connecté est inscrit comme joueur. Contrairement à
 * la synchronisation par clé (POST /tournaments/sync), aucun secret n'est
 * requis : l'authentification par session (ou clé API) suffit.
 */
export async function GET(request: NextRequest) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const entries = await listPlayerTournamentsForUser(user.userId);
    return NextResponse.json(
      entries.map(({ tournament, player }) => ({ tournament, player: sanitizePlayer(player) }))
    );
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
