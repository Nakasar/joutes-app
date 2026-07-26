import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { createTournamentSchema } from "@/lib/schemas/tournament.schema";
import { getEventById } from "@/lib/db/events";
import {
  createTournament,
  listMatchesByRound,
  listPhases,
  listPlayers,
  listRounds,
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
    const summaries = await Promise.all(
      tournaments.map(async (tournament) => {
        const [players, phases, rounds] = await Promise.all([
          listPlayers(tournament.id),
          listPhases(tournament.id),
          listRounds(tournament.id),
        ]);

        const ordered = [...rounds].sort((a, b) => a.number - b.number);
        const currentRound =
          ordered.filter((r) => r.status === "in-progress").pop() ?? ordered[ordered.length - 1];
        const currentPhase = currentRound
          ? phases.find((p) => p.id === currentRound.phaseId)
          : undefined;
        const matches = currentRound
          ? await listMatchesByRound(tournament.id, currentRound.id)
          : [];

        return {
          ...tournament,
          summary: {
            playersCount: players.filter((p) => p.status !== "dropped").length,
            phases: phases.map((p) => ({ type: p.type, plannedRounds: p.plannedRounds, topCut: p.topCut })),
            currentRound: currentRound
              ? {
                  id: currentRound.id,
                  number: currentRound.number,
                  plannedRounds: currentPhase?.plannedRounds,
                  reportedMatches: matches.filter((m) => m.status === "completed").length,
                  totalMatches: matches.length,
                }
              : null,
          },
        };
      })
    );

    return NextResponse.json(summaries);
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
