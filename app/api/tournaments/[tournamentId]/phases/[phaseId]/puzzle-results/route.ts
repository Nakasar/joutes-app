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
 * self-reporting.
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
    let playerId = validated.playerId;
    if (!isOrganizer) {
      if (!tournament.settings.allowSelfReporting) {
        throw new TournamentError(
          "forbidden",
          "Le self-reporting est désactivé sur ce tournoi : voyez l'organisation"
        );
      }
      if (playerId && !actor.playerIds.includes(playerId)) {
        throw new TournamentError("forbidden", "Vous ne pouvez rapporter que votre propre temps");
      }
      playerId = playerId ?? actor.playerIds[0];
      // Une correction du temps reste la main de l'organisation : le joueur
      // rapporte l'instant où il a terminé, pas un temps de son choix.
      if (validated.durationSeconds !== undefined) {
        throw new TournamentError(
          "forbidden",
          "Seule l'organisation peut saisir un temps : signalez simplement la fin du puzzle"
        );
      }
    }
    if (!playerId) {
      throw new TournamentError("invalid", "Aucun joueur désigné");
    }

    const result = await recordPuzzleResult(tournamentId, phaseId, {
      playerId,
      durationSeconds: validated.durationSeconds,
      selfReported: !isOrganizer,
      reportedBy: actor.id,
      // Un puzzle ne se termine qu'une fois : le joueur ne réécrit pas son
      // propre temps. L'organisation, elle, repointe qui elle veut.
      overwrite: isOrganizer,
    });

    const player = await getPlayerById(tournamentId, playerId);
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
