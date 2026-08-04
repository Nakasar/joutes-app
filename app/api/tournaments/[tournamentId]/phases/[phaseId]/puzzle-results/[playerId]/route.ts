import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { updatePuzzleResultSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  deletePuzzleResult,
  getPlayerById,
  recordActivity,
  requireTournament,
  updatePuzzleResultTime,
} from "@/lib/db/tournaments";
import { formatDuration } from "@/lib/tournament-timer";
import {
  tournamentErrorResponse,
  unauthorizedResponse,
} from "../../../../../utils";

type Params = { params: Promise<{ tournamentId: string; phaseId: string; playerId: string }> };

/**
 * Corrige le temps relevé pour un joueur (organisation) : chronomètre lancé en
 * retard, joueur signalé après coup, erreur de saisie.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, phaseId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const body = await request.json();
    const validated = updatePuzzleResultSchema.parse(body);

    const result = await updatePuzzleResultTime(
      tournamentId,
      phaseId,
      playerId,
      validated.durationSeconds
    );

    const player = await getPlayerById(tournamentId, playerId);
    await recordActivity(tournamentId, "puzzle-time-edited", {
      player: player?.displayName ?? "?",
      time: formatDuration(result.durationSeconds),
    });

    return NextResponse.json(result);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/** Retire le temps relevé : le joueur redevient « puzzle non terminé ». */
export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, phaseId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const player = await getPlayerById(tournamentId, playerId);
    await deletePuzzleResult(tournamentId, phaseId, playerId);
    await recordActivity(tournamentId, "puzzle-cleared", {
      player: player?.displayName ?? "?",
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
