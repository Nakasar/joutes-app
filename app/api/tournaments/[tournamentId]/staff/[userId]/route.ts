import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import {
  assertIsOrganizer,
  removeTournamentStaff,
  requireTournament,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../utils";

// Retire un membre du staff (organisateur ou arbitre). Réservé aux
// organisateurs ; le créateur du tournoi ne peut pas être retiré.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; userId: string }> }
) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, userId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    await removeTournamentStaff(tournamentId, userId);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
