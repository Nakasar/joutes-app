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

    return NextResponse.json(updated);
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

    await deleteTournament(tournamentId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
