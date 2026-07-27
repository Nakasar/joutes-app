import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { assertCanManage, deletePenalty, requireTournament } from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../../../utils";

type Params = { params: Promise<{ tournamentId: string; penaltyId: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, penaltyId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    await deletePenalty(tournamentId, penaltyId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
