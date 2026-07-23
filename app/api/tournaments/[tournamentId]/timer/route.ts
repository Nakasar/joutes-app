import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { timerActionSchema } from "@/lib/schemas/tournament.schema";
import {
  assertIsOrganizer,
  pauseTimer,
  requireTournament,
  resumeTimer,
  startTimer,
  stopTimer,
  TournamentError,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * Contrôle du minuteur (organisateurs) : `start` (avec durée) le lance en
 * fixant un instant de fin absolu ; `pause` mémorise le temps restant ;
 * `resume` reprend depuis ce temps ; `stop` l'arrête.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    const body = await request.json();
    const validated = timerActionSchema.parse(body);

    let updated;
    switch (validated.action) {
      case "start":
        updated = await startTimer(tournamentId, validated.durationSeconds);
        break;
      case "pause":
        updated = await pauseTimer(tournamentId);
        break;
      case "resume":
        updated = await resumeTimer(tournamentId);
        break;
      case "stop":
        updated = await stopTimer(tournamentId);
        break;
      default: {
        // Exhaustivité : toute nouvelle action du schéma doit être gérée ci-dessus.
        const _exhaustive: never = validated;
        throw new TournamentError("invalid", `Action de minuteur inconnue: ${JSON.stringify(_exhaustive)}`);
      }
    }

    return NextResponse.json(updated.timer ?? null);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
