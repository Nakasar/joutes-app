import {NextRequest, NextResponse} from "next/server";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {getGameBySlugOrId} from "@/lib/db/games";
import {countErratasByGameId, getErratasByGameId} from "@/lib/db/erratas";

export async function GET(request: NextRequest, {params}: { params: Promise<{ gameId: string }> }) {
  const {gameId} = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({error: "Game not found"}, {status: 404});
  }

  const session = await auth.api.getSession({headers: await headers()});
  const userId = session?.user?.id;

  const searchParams = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const offset = (page - 1) * limit;

  const [erratas, totalCount] = await Promise.all([
    getErratasByGameId({gameId: game.id, offset, limit, userId}),
    countErratasByGameId(game.id),
  ]);

  return NextResponse.json(erratas, {
    headers: {
      'x-page': page.toString(),
      'x-page-size': limit.toString(),
      'x-count': totalCount.toString(),
    },
  });
}
