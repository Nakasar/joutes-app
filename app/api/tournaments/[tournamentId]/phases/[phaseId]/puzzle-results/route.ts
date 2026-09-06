import { NextRequest, NextResponse } from "next/server";
import { recordPuzzleResultSchema } from "@/lib/schemas/tournament.schema";
import {
  assertPrincipalCanRead,
  buildMatchActor,
  getPlayerById,
  listPuzzleResults,
  principalCanManage,
  recordActivity,
  recordPuzzleResult,
  requireTournament,
  TournamentError,
} from "@/lib/db/tournaments";
import { planPuzzleReport } from "@/lib/tournaments/puzzle-report";
import { formatDuration } from "@/lib/tournament-timer";
import {
  resolveTournamentPrincipal,
  tournamentErrorResponse,
  unauthorizedResponse,
} from "../../../../utils";

type Params = { params: Promise<{ tournamentId: string; phaseId: string }> };

/** Temps relevés sur le puzzle de la phase, du plus rapide au plus lent. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, phaseId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    return NextResponse.json(await listPuzzleResults(tournamentId, phaseId));
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/**
 * Marque un joueur comme ayant terminé le puzzle de la phase : enregistre le
 * temps courant du chronomètre (ou celui fourni, pour rattraper un relevé
 * manqué). L'organisation peut désigner n'importe quel joueur ; un joueur ne
 * peut se signaler que lui-même, et seulement si le tournoi autorise le
 * self-reporting. Sans joueur désigné, la requête vise l'inscription de son
 * auteur — y compris quand celui-ci organise le tournoi qu'il joue.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, phaseId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const body = await request.json().catch(() => ({}));
    const validated = recordPuzzleResultSchema.parse(body);

    const actor = await buildMatchActor(tournament, principal);
    const isOrganizer = principalCanManage(tournament, principal);

    // Le joueur visé : celui demandé par l'organisation, sinon l'auteur de la
    // requête. Un joueur inscrit deux fois (rare) doit préciser lequel.
    const plan = planPuzzleReport(
      validated,
      { playerIds: actor.playerIds, isOrganizer },
      { allowSelfReporting: tournament.settings.allowSelfReporting }
    );
    if (!plan.ok) {
      throw new TournamentError(plan.kind, plan.message);
    }

    const result = await recordPuzzleResult(tournamentId, phaseId, {
      playerId: plan.playerId,
      durationSeconds: validated.durationSeconds,
      selfReported: plan.selfReported,
      reportedBy: actor.id,
      overwrite: plan.overwrite,
    });

    const player = await getPlayerById(tournamentId, plan.playerId);
    await recordActivity(
      tournamentId,
      "puzzle-solved",
      {
        player: player?.displayName ?? "?",
        time: formatDuration(result.durationSeconds),
      },
      actor.label
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
