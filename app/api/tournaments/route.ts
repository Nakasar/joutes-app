import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { createTournamentSchema } from "@/lib/schemas/tournament.schema";
import { getEventById } from "@/lib/db/events";
import { canManageEvent } from "@/lib/events/tournament-link";
import {
  createTournament,
  getTournamentByEventId,
  listTournamentSummaries,
  listTournamentsForUser,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "./utils";
import { isLeagueOrganizer } from "@/lib/db/leagues";
import { requireLinkableLeague } from "@/lib/leagues/tournament-results";

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
      // Créer le tournoi d'un événement, c'est le faire apparaître sur sa page
      // et pouvoir y transférer ses inscrits : mêmes droits qu'au rattachement
      // d'un tournoi existant, et toujours un seul tournoi par événement.
      const event = await getEventById(validated.eventId).catch(() => null);
      if (!event) {
        return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 });
      }
      if (!canManageEvent(event, user.userId)) {
        return NextResponse.json(
          { error: "Vous ne pouvez pas créer de tournoi pour un événement que vous ne gérez pas" },
          { status: 403 }
        );
      }
      const alreadyLinked = await getTournamentByEventId(event.id);
      if (alreadyLinked) {
        return NextResponse.json(
          { error: `Un tournoi (« ${alreadyLinked.name} ») est déjà associé à cet événement` },
          { status: 409 }
        );
      }
      details.location ??= event.lair?.name ?? event.lair?.address ?? undefined;
      details.capacity ??= event.maxParticipants ?? undefined;
      const startsAt = new Date(event.startDateTime);
      if (details.startsAt === undefined && !Number.isNaN(startsAt.getTime())) {
        details.startsAt = startsAt;
      }
    }

    // Créer un tournoi au nom d'une ligue engage le classement de celle-ci :
    // même contrôle qu'au rattachement d'un tournoi existant.
    if (validated.leagueId) {
      const league = await requireLinkableLeague(validated.leagueId);
      if (!(await isLeagueOrganizer(league.id, user.userId))) {
        return NextResponse.json(
          { error: "Vous ne pouvez pas créer un tournoi pour une ligue que vous n'organisez pas" },
          { status: 403 }
        );
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
