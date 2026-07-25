import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { addTournamentStaffSchema } from "@/lib/schemas/tournament.schema";
import {
  addTournamentStaff,
  assertCanManage,
  assertIsOrganizer,
  listTournamentStaff,
  requireTournament,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

// Staff du tournoi (créateur, organisateurs, arbitres). Lecture ouverte au
// staff ; l'ajout est réservé aux organisateurs (un arbitre ne peut pas
// modifier le staff, sinon il pourrait s'octroyer le droit de suppression).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    return NextResponse.json(await listTournamentStaff(tournament));
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

    const body = await request.json();
    const validated = addTournamentStaffSchema.parse(body);

    const entry = await addTournamentStaff(tournamentId, validated.identifier, validated.role);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
