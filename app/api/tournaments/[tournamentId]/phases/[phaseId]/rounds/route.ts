import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import {
  assertPrincipalCanRead,
  assertCanManage,
  createNextRound,
  listPlayers,
  listRounds,
  recordActivity,
  requireTournament,
} from "@/lib/db/tournaments";
import { notifyRoundPaired } from "@/lib/tournaments/notifications";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../../../../utils";

type Params = { params: Promise<{ tournamentId: string; phaseId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, phaseId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const rounds = await listRounds(tournamentId, phaseId);
    return NextResponse.json(rounds);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/**
 * Crée la ronde suivante de la phase : pairings générés automatiquement pour
 * les phases swiss/bracket (avec BYE auto-complétés), ronde vide pour freeform.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, phaseId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const { round, matches } = await createNextRound(tournamentId, phaseId, user.userId);
    await recordActivity(tournamentId, "round-created", {
      round: round.number,
      matches: matches.length,
    });

    // Une ronde qui s'ouvre se dit, quel qu'en soit le rythme. L'intervalle en
    // avait besoin parce qu'il court sur plusieurs jours ; la ronde sur place en
    // profite aussi, un téléphone en poche valant mieux qu'un écran à aller
    // consulter. L'envoi n'est jamais bloquant.
    try {
      await notifyRoundPaired(tournament, round, matches, await listPlayers(tournamentId));
    } catch (error) {
      console.error("Notification d'appariement échouée", error);
    }

    return NextResponse.json({ ...round, matches }, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
