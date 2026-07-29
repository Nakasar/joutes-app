import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { updateTournamentMatchSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  assertPrincipalCanRead,
  buildMatchActor,
  clearMatchResult,
  confirmMatchResult,
  deleteMatch,
  disputeMatchResult,
  extendMatch,
  forfeitMatch,
  getMatchById,
  recordActivity,
  reportMatchResult,
  requireTournament,
  setMatchTable,
  TournamentError,
} from "@/lib/db/tournaments";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../../../utils";

type Params = { params: Promise<{ tournamentId: string; matchId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, matchId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const match = await getMatchById(tournamentId, matchId);
    if (!match) {
      throw new TournamentError("not-found", "Match non trouvé");
    }
    return NextResponse.json(match);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

/**
 * Opérations sur un match, choisies par le champ `action` du body :
 * - `report` : rapporter un score (organisateur, ou joueur du match si le
 *   self-reporting est activé ; passe en attente de confirmation si le
 *   tournoi l'exige).
 * - `confirm` : confirmer le score rapporté par l'adversaire (ou un
 *   organisateur valide manuellement un score en attente de confirmation).
 * - `dispute` : contester le résultat.
 * - `clear` : supprimer un résultat rapporté (organisateur) — réinitialise le match.
 * - `forfeit` : conclure un match non joué (organisateur) — victoire d'un
 *   joueur comptée comme un bye, ou double défaite si aucun vainqueur.
 * Accessible avec une session, une clé API jts_ ou la clé de synchronisation
 * tpsk_ d'un joueur du tournoi.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { tournamentId, matchId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const body = await request.json();
    const validated = updateTournamentMatchSchema.parse(body);

    const actor = await buildMatchActor(tournament, principal);

    let match;
    if (validated.action === "report") {
      match = await reportMatchResult(tournament, matchId, { games: validated.games }, actor);
      await recordActivity(tournamentId, "match-reported", { table: match.tableNumber ?? 0 }, actor.label);
    } else if (validated.action === "confirm") {
      match = await confirmMatchResult(tournament, matchId, actor);
      await recordActivity(tournamentId, "match-confirmed", { table: match.tableNumber ?? 0 }, actor.label);
    } else if (validated.action === "clear") {
      match = await clearMatchResult(tournament, matchId, actor);
      await recordActivity(tournamentId, "match-cleared", { table: match.tableNumber ?? 0 }, actor.label);
    } else if (validated.action === "set-table") {
      // Modification du numéro de table : réservée aux gestionnaires.
      if (!actor.isOrganizer) {
        return NextResponse.json(
          { error: "Réservé aux organisateurs et arbitres du tournoi" },
          { status: 403 }
        );
      }
      match = await setMatchTable(tournamentId, matchId, validated.tableNumber);
    } else if (validated.action === "extend") {
      // Prolongation d'une table : réservée aux gestionnaires.
      if (!actor.isOrganizer) {
        return NextResponse.json(
          { error: "Réservé aux organisateurs et arbitres du tournoi" },
          { status: 403 }
        );
      }
      match = await extendMatch(tournamentId, matchId, validated.seconds);
      await recordActivity(
        tournamentId,
        "match-extended",
        {
          table: match.tableNumber ?? 0,
          minutes: Math.round((match.extensionSeconds ?? 0) / 60),
        },
        actor.label
      );
    } else if (validated.action === "forfeit") {
      match = await forfeitMatch(tournament, matchId, { winnerId: validated.winnerId }, actor);
      await recordActivity(
        tournamentId,
        "match-forfeited",
        { table: match.tableNumber ?? 0, doubleLoss: validated.winnerId ? 0 : 1 },
        actor.label
      );
    } else {
      match = await disputeMatchResult(tournament, matchId, actor);
      await recordActivity(tournamentId, "match-disputed", { table: match.tableNumber ?? 0 }, actor.label);
    }

    return NextResponse.json(match);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, matchId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    await deleteMatch(tournamentId, matchId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
