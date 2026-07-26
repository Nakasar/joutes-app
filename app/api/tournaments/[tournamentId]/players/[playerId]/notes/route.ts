import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { createTournamentNoteSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  createNote,
  listNotes,
  listRounds,
  requireTournament,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../../utils";

type Params = { params: Promise<{ tournamentId: string; playerId: string }> };

// Notes internes sur un joueur : visibles du staff du tournoi uniquement,
// jamais exposées au joueur concerné ni aux autres participants.
export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const notes = await listNotes(tournamentId, playerId);
    return NextResponse.json(notes);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, playerId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const body = await request.json();
    const validated = createTournamentNoteSchema.parse(body);

    // Les numéros de ronde repartent à 1 à chaque phase : `createdAt` est le
    // seul ordre valable pour désigner la ronde la plus récente.
    const rounds = (await listRounds(tournamentId)).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const current = rounds.filter((r) => r.status === "in-progress").pop() ?? rounds[rounds.length - 1];

    const note = await createNote(tournamentId, playerId, {
      content: validated.content,
      roundNumber: current?.number,
      createdBy: user.userId,
    });
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
