import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { setPuzzleSeatSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  deletePuzzleSeat,
  getPhaseById,
  getPlayerById,
  listPlayers,
  recordActivity,
  requireTournament,
  setPuzzleSeat,
} from "@/lib/db/tournaments";
import { notifyPuzzleSeats } from "@/lib/tournaments/notifications";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../../../utils";

type Params = { params: Promise<{ tournamentId: string; phaseId: string; playerId: string }> };

/**
 * Pose ou corrige la table d'un joueur (organisation). Le joueur est prévenu
 * comme lors d'une distribution : une table qui change, c'est une table où
 * aller — l'envoi n'est jamais bloquant.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, phaseId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const body = await request.json();
    const validated = setPuzzleSeatSchema.parse(body);

    const seat = await setPuzzleSeat(
      tournamentId,
      phaseId,
      playerId,
      validated.tableNumber,
      user.userId
    );

    const player = await getPlayerById(tournamentId, playerId);
    await recordActivity(tournamentId, "puzzle-table-set", {
      player: player?.displayName ?? "?",
      table: seat.tableNumber,
    });

    try {
      const [phase, players] = await Promise.all([
        getPhaseById(tournamentId, phaseId),
        listPlayers(tournamentId),
      ]);
      if (phase) await notifyPuzzleSeats(tournament, phase, [seat], players);
    } catch (error) {
      console.error("Notification de la table de puzzle échouée", error);
    }

    return NextResponse.json(seat);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/** Retire la table d'un joueur : il redevient « sans table ». */
export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, phaseId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    await deletePuzzleSeat(tournamentId, phaseId, playerId);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
