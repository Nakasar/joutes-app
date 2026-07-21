import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { createTournamentSchema } from "@/lib/schemas/tournament.schema";
import { createTournament, listTournamentsForUser } from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "./utils";

export async function GET(request: NextRequest) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const tournaments = await listTournamentsForUser(user.userId);
    return NextResponse.json(tournaments);
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

    const tournament = await createTournament({
      ...validated,
      createdBy: user.userId,
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
