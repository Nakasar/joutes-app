import { NextRequest, NextResponse } from "next/server";
import {
  assertPrincipalCanRead,
  getTournamentRoundHistory,
  requireTournament,
  sanitizePlayer,
} from "@/lib/db/tournaments";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../../utils";

/**
 * Historique du tournoi : phases ordonnées, chacune avec ses rondes et le
 * récapitulatif des matchs, ainsi que le classement figé à l'issue de chaque
 * ronde (renseigné dès qu'un organisateur l'a validé). Accessible aux
 * organisateurs et aux joueurs du tournoi.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  try {
    const { tournamentId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const { phases, players } = await getTournamentRoundHistory(tournamentId);
    return NextResponse.json({ phases, players: players.map(sanitizePlayer) });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
