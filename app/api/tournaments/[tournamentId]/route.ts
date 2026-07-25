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
    }

    const updated = await updateTournament(tournamentId, validated);
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
