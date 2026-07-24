import {NextRequest, NextResponse} from "next/server";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {getGameBySlugOrId} from "@/lib/db/games";
import {getPolicyById} from "@/lib/db/policies";

export async function GET(_request: NextRequest, {params}: { params: Promise<{ gameId: string; policyId: string }> }) {
  const {gameId, policyId} = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({error: "Game not found"}, {status: 404});
  }

  const session = await auth.api.getSession({headers: await headers()});
  const policy = await getPolicyById(policyId, session?.user?.id, game.id);

  if (!policy) {
    return NextResponse.json({error: "Policy not found"}, {status: 404});
  }

  return NextResponse.json(policy);
}
