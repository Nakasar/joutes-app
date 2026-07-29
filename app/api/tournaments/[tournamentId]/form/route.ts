import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { updateTournamentFormSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  assertPrincipalCanRead,
  formIsInLateWindow,
  formIsOpenForPlayer,
  requireTournament,
  saveTournamentForm,
} from "@/lib/db/tournaments";
import { resolveFormGameContext } from "@/lib/tournaments/decklist-parsing";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../../utils";

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * Formulaire d'inscription du tournoi et ce qu'il faut pour le remplir : le
 * slug du jeu (recherche de cartes) et le fait qu'une liste de deck puisse
 * être analysée, que le client n'a aucun moyen de déduire seul.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const game = await resolveFormGameContext(tournament.gameId);

    return NextResponse.json({
      form: tournament.registrationForm ?? null,
      ...game,
      openForPlayers: formIsOpenForPlayer(tournament),
      lateWindow: formIsInLateWindow(tournament),
    });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const body = await request.json();
    const validated = updateTournamentFormSchema.parse(body);

    const form = await saveTournamentForm(tournamentId, validated);
    return NextResponse.json({ form });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
