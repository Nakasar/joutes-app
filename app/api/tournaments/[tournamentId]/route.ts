import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { getEventById } from "@/lib/db/events";
import { updateTournamentSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  assertIsOrganizer,
  assertPrincipalCanRead,
  deleteTournament,
  listPhases,
  listPlayers,
  principalCanManage,
  requireTournament,
  sanitizePlayer,
  updateTournament,
} from "@/lib/db/tournaments";
import { resolveTournamentPrincipal, tournamentErrorResponse, unauthorizedResponse } from "../utils";
import { notifyTournamentStatus } from "@/lib/tournaments/notifications";
import { isLeagueOrganizer } from "@/lib/db/leagues";
import {
  LeagueLinkError,
  requireLinkableLeague,
  revertTournamentFromLeague,
  syncTournamentLeague,
  type TournamentLeagueReport,
} from "@/lib/leagues/tournament-results";

export async function GET(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  try {
    const { tournamentId } = await params;
    const principal = await resolveTournamentPrincipal(request, tournamentId);
    if (!principal) return unauthorizedResponse();

    const tournament = await requireTournament(tournamentId);
    await assertPrincipalCanRead(tournament, principal);

    const [phases, players] = await Promise.all([
      listPhases(tournamentId),
      listPlayers(tournamentId),
    ]);

    const organizer = principalCanManage(tournament, principal);

    return NextResponse.json({
      ...tournament,
      phases,
      players: organizer ? players : players.map(sanitizePlayer),
    });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const body = await request.json();
    const validated = updateTournamentSchema.parse(body);
    const details = { ...validated };

    // La modification du staff reste réservée aux organisateurs : un arbitre
    // pourrait sinon s'octroyer le rôle d'organisateur (et donc la suppression).
    if (validated.organizerIds !== undefined) {
      assertIsOrganizer(tournament, user.userId);
    }

    // Lier le tournoi à un événement requiert de pouvoir gérer cet événement
    // (créateur ou staff organisateur) : le lien fait apparaître le portail du
    // tournoi sur la page de l'événement.
    if (typeof validated.eventId === "string") {
      const event = await getEventById(validated.eventId);
      if (!event) {
        return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 });
      }
      const canManageEvent =
        event.creatorId === user.userId ||
        event.staff?.some((s) => s.userId === user.userId && s.role === "organizer");
      if (!canManageEvent) {
        return NextResponse.json(
          { error: "Vous ne pouvez pas lier ce tournoi à un événement que vous ne gérez pas" },
          { status: 403 }
        );
      }

      // La date et le lieu d'un tournoi rattaché viennent de son événement : le
      // rattachement les reprend, comme le fait déjà la création. Une valeur
      // envoyée explicitement dans la même requête reste prioritaire.
      details.location ??= event.lair?.name ?? event.lair?.address ?? undefined;
      details.capacity ??= event.maxParticipants ?? undefined;
      const startsAt = new Date(event.startDateTime);
      if (details.startsAt === undefined && !Number.isNaN(startsAt.getTime())) {
        details.startsAt = startsAt;
      }
    }

    // Réservé aux organisateurs du tournoi — un arbitre gère la salle, pas les
    // engagements pris envers une ligue.
    //
    // Rattacher engage le classement d'une ligue tierce : il faut aussi
    // l'organiser. Détacher, non : personne ne doit être retenu de force dans
    // une ligue, et l'organisateur du tournoi peut toujours en sortir. Côté
    // ligue, `detachTournamentFromLeagueAction` offre le chemin symétrique.
    if (validated.leagueId !== undefined) {
      assertIsOrganizer(tournament, user.userId);

      if (typeof validated.leagueId === "string") {
        const league = await requireLinkableLeague(validated.leagueId);
        if (!(await isLeagueOrganizer(league.id, user.userId))) {
          return NextResponse.json(
            { error: "Vous ne pouvez pas rattacher un tournoi à une ligue que vous n'organisez pas" },
            { status: 403 }
          );
        }
      }
    }

    const updated = await updateTournament(tournamentId, details);

    // Les deux bornes du tournoi, et elles seules : on compare au statut d'avant
    // plutôt qu'à la valeur envoyée, pour qu'une modification qui répète le
    // statut courant ne renvoie pas le message. Jamais bloquant.
    if (updated && updated.status !== tournament.status && updated.status !== "draft") {
      try {
        await notifyTournamentStatus(updated, updated.status, await listPlayers(tournamentId));
      } catch (error) {
        console.error("Notification de statut de tournoi échouée", error);
      }
    }

    // Contrairement à la notification, la contribution à la ligue n'est pas
    // « au mieux » : c'est le classement de la ligue qui en dépend. Un échec
    // est donc rapporté à l'organisateur — mais sans annuler le changement de
    // statut, qui lui a bien eu lieu. Rejouer est sans risque, l'application
    // commence toujours par annuler.
    let leagueReport: TournamentLeagueReport | null = null;
    let leagueError: string | undefined;
    try {
      leagueReport = await syncTournamentLeague(tournament, updated);
    } catch (error) {
      console.error("Contribution du tournoi à la ligue échouée", error);
      leagueError =
        error instanceof Error ? error.message : "La ligue n'a pas pu être mise à jour";
    }

    return NextResponse.json({
      ...updated,
      ...(leagueReport ? { leagueReport } : {}),
      ...(leagueError ? { leagueError } : {}),
    });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    // Un tournoi supprimé ne doit pas laisser ses points dans la ligue : plus
    // aucun écran ne permettrait alors de les retirer.
    if (tournament.leagueId && tournament.status === "completed") {
      await revertTournamentFromLeague(tournamentId, tournament.leagueId);
    }

    await deleteTournament(tournamentId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
