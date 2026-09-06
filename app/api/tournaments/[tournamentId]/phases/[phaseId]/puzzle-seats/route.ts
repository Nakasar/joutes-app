import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { assignPuzzleSeatsSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  assertPrincipalCanRead,
  assignPuzzleSeats,
  getPhaseById,
  listPlayers,
  listPuzzleSeats,
  recordActivity,
  requireTournament,
} from "@/lib/db/tournaments";
import { notifyPuzzleSeats } from "@/lib/tournaments/notifications";
import {
  resolveTournamentPrincipal,
  tournamentErrorResponse,
  unauthorizedResponse,
} from "../../../../utils";

type Params = { params: Promise<{ tournamentId: string; phaseId: string }> };

/**
 * Les tables attribuées sur le puzzle de la phase, dans l'ordre des tables.
 * Lisible par les joueurs : seule la forme publique sort — qui est à quelle
 * table — sans l'auteur de l'attribution ni ses horodatages.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, phaseId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const seats = await listPuzzleSeats(tournamentId, phaseId);
    return NextResponse.json(
      seats.map((seat) => ({ playerId: seat.playerId, tableNumber: seat.tableNumber }))
    );
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/**
 * Distribue les tables du puzzle à tous les joueurs actifs (organisation).
 * Sans `reset`, les joueurs déjà placés gardent leur table : c'est le geste
 * pour un retardataire. Chaque joueur dont la table vient d'être attribuée ou
 * de changer est prévenu — l'envoi n'est jamais bloquant.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, phaseId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const body = await request.json().catch(() => ({}));
    const validated = assignPuzzleSeatsSchema.parse(body);

    const { seats, changed } = await assignPuzzleSeats(tournamentId, phaseId, {
      reset: validated.reset,
      assignedBy: user.userId,
    });

    await recordActivity(tournamentId, "puzzle-tables-assigned", {
      count: changed.length,
      total: seats.length,
    });

    if (changed.length > 0) {
      try {
        const [phase, players] = await Promise.all([
          getPhaseById(tournamentId, phaseId),
          listPlayers(tournamentId),
        ]);
        if (phase) await notifyPuzzleSeats(tournament, phase, changed, players);
      } catch (error) {
        console.error("Notification des tables de puzzle échouée", error);
      }
    }

    return NextResponse.json({ seats, notified: changed.length }, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
