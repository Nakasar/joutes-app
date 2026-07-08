import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createBooster, getBoosters } from "@/lib/db/boosters";
import { getGameBySlugOrId } from "@/lib/db/games";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gameSlug = request.nextUrl.searchParams.get("gameSlug");
  if (!gameSlug) {
    return NextResponse.json({ error: "Missing gameSlug" }, { status: 400 });
  }

  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const boosters = await getBoosters({ userId: session.user.id, gameId: game.id, limit: 100 });
  return NextResponse.json({ boosters });
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const gameSlug = typeof body?.gameSlug === "string" ? body.gameSlug : null;
  const setCode = typeof body?.setCode === "string" ? body.setCode.trim() : "";
  const lang = typeof body?.lang === "string" ? body.lang.trim() : "";
  const type = typeof body?.type === "string" && body.type.trim() ? body.type.trim() : "custom";

  if (!gameSlug || !setCode || !lang) {
    return NextResponse.json({ error: "Missing gameSlug, setCode or lang" }, { status: 400 });
  }

  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const booster = await createBooster({
    gameId: game.id,
    userId: session.user.id,
    setCode,
    lang,
    type,
    cards: [],
    archived: false,
  });

  return NextResponse.json({ id: booster.id });
}
