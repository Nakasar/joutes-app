import {NextRequest, NextResponse} from "next/server";
import {requirePermission} from "@/lib/db/permissions";
import {countAllPolicies, getAllPolicies} from "@/lib/db/policies";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {getGameBySlugOrId} from "@/lib/db/games";

export async function GET(request: NextRequest, {params}: { params: Promise<{ gameId: string }> }) {
  const {gameId} = await params;

  const session = await auth.api.getSession({headers: await headers()});
  const userId = session?.user?.id;

  const game = await getGameBySlugOrId(gameId);

  if (!game) {
    return NextResponse.json({error: "Game not found"}, {status: 404});
  }

  const searchParams = new URL(request.url).searchParams;
  const search = searchParams.get('searchQuery') || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");

  const offset = (page - 1) * limit;

  const [policies, totalCount] = await Promise.all([
    getAllPolicies({gameId: game.id, offset, limit, userId, search, sortOrder: 'asc'}),
    countAllPolicies({gameId: game.id, search}),
  ]);

  return NextResponse.json(policies, {
    headers: {
      'x-page': page.toString(),
      'x-page-size': limit.toString(),
      'x-count': totalCount.toString(),
    },
  });
}

export async function POST(request: NextRequest, {params}: { params: Promise<{ gameId: string }> }) {
  const {gameId} = await params;

  const game = await getGameBySlugOrId(gameId);

  if (!game) {
    return NextResponse.json({error: "Game not found"}, {status: 404});
  }

  await requirePermission('policies:update');

  return NextResponse.json({});
}
