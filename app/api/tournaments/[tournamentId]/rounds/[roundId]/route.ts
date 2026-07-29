import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { updateTournamentRoundSchema } from "@/lib/schemas/tournament.schema";
import {
  assertPrincipalCanRead,
  assertCanManage,
  closeRoundOnDeadline,
  deleteRound,
  getRoundById,
  listMatchesByRound,
  recordActivity,
  reopenRound,
  requireTournament,
  setRoundDeadline,
  setRoundScenario,
  TournamentError,
} from "@/lib/db/tournaments";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../../../utils";

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, roundId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const round = await getRoundById(tournamentId, roundId);
    if (!round) {
      throw new TournamentError("not-found", "Ronde non trouvée");
    }

    const matches = await listMatchesByRound(tournamentId, roundId);
    return NextResponse.json({ ...round, matches });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/**
 * Actions sur une ronde (organisateur) :
 * - `reopen` : rouvre une ronde terminée (retour « en cours ») pour en refaire
 *   la ronde courante et corriger les résultats.
 * - `set-deadline` : déplace l'échéance d'un intervalle, ou la retire.
 * - `set-scenario` : change le scénario joué pendant la ronde.
 * - `close-deadline` : clôt l'intervalle, en appliquant aux matchs restés sans
 *   résultat la règle configurée sur la phase.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, roundId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const body = await request.json();
    const validated = updateTournamentRoundSchema.parse(body);

    let round;
    switch (validated.action) {
      case "reopen":
        round = await reopenRound(tournamentId, roundId);
        break;
      case "set-deadline":
        round = await setRoundDeadline(tournamentId, roundId, validated.deadlineAt);
        await recordActivity(tournamentId, "round-deadline-set", { round: round.number });
        break;
      case "set-scenario":
        round = await setRoundScenario(tournamentId, roundId, validated.scenario);
        break;
      case "close-deadline": {
        const closed = await closeRoundOnDeadline(tournamentId, roundId);
        round = closed.round;
        await recordActivity(tournamentId, "round-closed-on-deadline", {
          round: round.number,
          matches: closed.resolvedMatchIds.length,
        });
        break;
      }
    }

    return NextResponse.json(round);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, roundId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    await deleteRound(tournamentId, roundId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
