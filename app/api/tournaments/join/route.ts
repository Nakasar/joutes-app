import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { joinTournamentSchema } from "@/lib/schemas/tournament.schema";
import {
  getTournamentByJoinCode,
  joinTournament,
  sanitizePlayer,
  TournamentError,
} from "@/lib/db/tournaments";
import { getUserById } from "@/lib/db/users";
import { tournamentErrorResponse } from "../utils";

/**
 * Auto-inscription à un tournoi via son code de participation.
 * - Avec une session : le joueur est lié à son compte.
 * - Sans session : `displayName` est requis, le joueur est ajouté comme invité
 *   et reçoit sa clé de synchronisation pour lier son navigateur au tournoi.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, displayName } = joinTournamentSchema.parse(body);

    const tournament = await getTournamentByJoinCode(code);
    if (!tournament) {
      throw new TournamentError("not-found", "Aucun tournoi ne correspond à ce code");
    }

    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    // Pour un joueur connecté, le nom affiché vient de son compte (displayName
    // ou username), avec repli sur le nom de session — la session better-auth
    // peut ne pas porter de `name`, ce qui donnait « Joueur » par défaut.
    let resolvedName = displayName;
    if (userId) {
      const user = await getUserById(userId);
      resolvedName = user?.displayName || user?.username || session?.user?.name || displayName;
    }

    const { player, alreadyJoined } = await joinTournament(tournament, {
      userId,
      displayName: resolvedName,
    });

    return NextResponse.json({
      tournamentId: tournament.id,
      alreadyJoined,
      // L'invité conserve sa clé de synchronisation ; le compte connecté non.
      player: userId ? sanitizePlayer(player) : player,
    });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
