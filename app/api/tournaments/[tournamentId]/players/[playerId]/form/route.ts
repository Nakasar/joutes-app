import { NextRequest, NextResponse } from "next/server";
import { submitTournamentFormSchema } from "@/lib/schemas/tournament.schema";
import {
  assertFormAcceptsPlayerAnswers,
  formAcceptsPlayerAnswers,
  formIsInLateWindow,
  getPlayerById,
  principalCanManage,
  requireTournament,
  saveFormAnswers,
  TournamentError,
  type TournamentPrincipal,
} from "@/lib/db/tournaments";
import type { Tournament, TournamentPlayer } from "@/lib/types/Tournament";
import { gameSupportsDecklistParsing, resolveGameSlug } from "@/lib/tournaments/decklist-parsing";
import {
  resolveTournamentPrincipal,
  tournamentErrorResponse,
  unauthorizedResponse,
} from "../../../../utils";

type Params = { params: Promise<{ tournamentId: string; playerId: string }> };

/**
 * Les réponses au formulaire sont privées : seuls l'organisation et le joueur
 * concerné y accèdent. Un joueur est reconnu par sa clé de synchronisation ou
 * par le compte rattaché à sa fiche.
 */
function isSelf(player: TournamentPlayer, principal: TournamentPrincipal): boolean {
  return principal.kind === "player"
    ? principal.player.id === player.id
    : !!player.userId && player.userId === principal.userId;
}

async function loadContext(request: NextRequest, params: Params["params"]) {
  const { tournamentId, playerId } = await params;
  const principal = await resolveTournamentPrincipal(request, tournamentId);
  if (!principal) return null;

  const tournament = await requireTournament(tournamentId);
  const player = await getPlayerById(tournamentId, playerId);
  if (!player) {
    throw new TournamentError("not-found", "Joueur non trouvé");
  }

  const canManage = principalCanManage(tournament, principal);
  if (!canManage && !isSelf(player, principal)) {
    throw new TournamentError("forbidden", "Accès non autorisé à ces réponses");
  }

  return { tournament, player, canManage };
}

async function formPayload(
  tournament: Tournament,
  player: TournamentPlayer,
  canManage: boolean
) {
  const [gameSlug, decklistSupported] = await Promise.all([
    resolveGameSlug(tournament.gameId),
    gameSupportsDecklistParsing(tournament.gameId),
  ]);

  return {
    form: tournament.registrationForm ?? null,
    answers: player.formAnswers ?? [],
    // L'organisation corrige les réponses à tout moment ; le joueur tant que
    // le formulaire lui est ouvert, ou au titre des réponses tardives.
    canEdit: canManage || formAcceptsPlayerAnswers(tournament),
    // La saisie normale est close mais les réponses tardives sont acceptées :
    // ce que le joueur enregistre maintenant sera marqué.
    lateWindow: formIsInLateWindow(tournament),
    closesAt: tournament.registrationForm?.closesAt ?? null,
    gameSlug,
    decklistSupported,
  };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const context = await loadContext(request, params);
    if (!context) return unauthorizedResponse();

    return NextResponse.json(
      await formPayload(context.tournament, context.player, context.canManage)
    );
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const context = await loadContext(request, params);
    if (!context) return unauthorizedResponse();
    const { tournament, player, canManage } = context;

    if (!canManage) {
      assertFormAcceptsPlayerAnswers(tournament);
    }

    const body = await request.json();
    const validated = submitTournamentFormSchema.parse(body);

    const answers = await saveFormAnswers(tournament, player.id, validated.answers, {
      enforceRequired: !canManage,
      // Seule une réponse de joueur est tardive : une correction de
      // l'organisation n'est pas une soumission hors délai.
      markLate: !canManage && formIsInLateWindow(tournament),
    });

    return NextResponse.json({
      ...(await formPayload(tournament, player, canManage)),
      answers,
    });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
