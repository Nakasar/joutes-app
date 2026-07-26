import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { assertCanManage, deleteNote, requireTournament } from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../../../utils";

type Params = { params: Promise<{ tournamentId: string; noteId: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, noteId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    await deleteNote(tournamentId, noteId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
