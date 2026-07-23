import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { timerActionSchema } from "@/lib/schemas/tournament.schema";
import { assertIsOrganizer, requireTournament, startTimer, stopTimer } from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * Contrôle du minuteur (organisateurs) : `start` (avec durée) le lance en
 * fixant un instant de fin absolu ; `stop` l'arrête.
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

    const updated =
      validated.action === "start"
        ? await startTimer(tournamentId, validated.durationSeconds)
        : await stopTimer(tournamentId);

    return NextResponse.json(updated.timer ?? null);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
