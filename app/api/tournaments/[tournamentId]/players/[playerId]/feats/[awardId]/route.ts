import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { assertCanManage, deleteFeatAward, requireTournament } from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../../../../utils";

type Params = { params: Promise<{ tournamentId: string; awardId: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId, awardId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    await deleteFeatAward(tournamentId, awardId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
