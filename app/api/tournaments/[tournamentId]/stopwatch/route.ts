import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { stopwatchActionSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  pauseStopwatch,
  requireTournament,
  resetStopwatch,
  resumeStopwatch,
  startStopwatch,
  TournamentError,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * Contrôle du chronomètre des phases puzzle (organisateurs) : `start` le lance
 * à 0 en fixant un instant de départ absolu ; `pause` fige le temps écoulé ;
 * `resume` repart de ce temps ; `reset` le remet à zéro. Les temps déjà relevés
 * pour les joueurs ne sont jamais touchés par ces actions.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const body = await request.json();
    const validated = stopwatchActionSchema.parse(body);

    let updated;
    switch (validated.action) {
      case "start":
        updated = await startStopwatch(tournamentId);
        break;
      case "pause":
        updated = await pauseStopwatch(tournamentId);
        break;
      case "resume":
        updated = await resumeStopwatch(tournamentId);
        break;
      case "reset":
        updated = await resetStopwatch(tournamentId);
        break;
      default: {
        // Exhaustivité : toute nouvelle action du schéma doit être gérée ci-dessus.
        const _exhaustive: never = validated.action;
        throw new TournamentError("invalid", `Action de chronomètre inconnue: ${_exhaustive}`);
      }
    }

    return NextResponse.json(updated.stopwatch ?? null);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
