import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { createTournamentSchema } from "@/lib/schemas/tournament.schema";
import { getEventById } from "@/lib/db/events";
import {
  createTournament,
  listTournamentSummaries,
  listTournamentsForUser,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "./utils";

export async function GET(request: NextRequest) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const tournaments = await listTournamentsForUser(user.userId);

    // La liste des tournois affiche l'avancement de chacun (ronde en cours,
    // format, participants) : on l'assemble ici plutôt que de faire faire une
    // requête par tournoi au client.
    const summaries = await listTournamentSummaries(tournaments);

    return NextResponse.json(
      tournaments.map((tournament) => ({
        ...tournament,
        summary: summaries.get(tournament.id) ?? null,
      }))
    );
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const body = await request.json();
    const validated = createTournamentSchema.parse(body);

    // Les infos pratiques d'un tournoi adossé à un événement sont reprises de
    // celui-ci quand elles ne sont pas fournies. Le tournoi les porte ensuite
    // en propre : modifier l'événement ne les change plus, et un tournoi sans
    // événement reste renseignable à la main.
    const details = { ...validated };
    if (validated.eventId) {
      const event = await getEventById(validated.eventId).catch(() => null);
      if (event) {
        details.location ??= event.lair?.name ?? event.lair?.address ?? undefined;
        details.capacity ??= event.maxParticipants ?? undefined;
        const startsAt = new Date(event.startDateTime);
        if (details.startsAt === undefined && !Number.isNaN(startsAt.getTime())) {
          details.startsAt = startsAt;
        }
      }
    }

    const tournament = await createTournament({
      ...details,
      createdBy: user.userId,
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
