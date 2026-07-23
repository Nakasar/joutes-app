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

/**
 * Met à jour un joueur.
 * - Organisateur : mise à jour complète (nom, seed, statut REGISTERED/DROPPED).
 * - Joueur lui-même (session ou clé de synchronisation) : peut uniquement se
 *   retirer du tournoi (statut DROPPED), rien d'autre.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, playerId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    const body = await request.json();
    const validated = updateTournamentPlayerSchema.parse(body);

    if (principalIsOrganizer(tournament, principal)) {
      const player = await updatePlayer(tournamentId, playerId, validated);
      return NextResponse.json(player);
    }

    // Non-organisateur : self-drop uniquement.
    await assertPrincipalCanRead(tournament, principal);
    const target = await getPlayerById(tournamentId, playerId);
    if (!target) {
      throw new TournamentError("not-found", "Joueur non trouvé");
    }
    const isSelf =
      principal.kind === "player"
        ? principal.player.id === playerId
        : target.userId === principal.userId;
    if (!isSelf) {
      throw new TournamentError("forbidden", "Vous ne pouvez modifier que votre propre inscription");
    }
    if (validated.status !== "dropped" || validated.displayName !== undefined || validated.seed != null) {
      throw new TournamentError("forbidden", "Vous pouvez uniquement vous retirer du tournoi");
    }

    const player = await updatePlayer(tournamentId, playerId, { status: "dropped" });
    return NextResponse.json(sanitizePlayer(player));
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
