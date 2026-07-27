import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { countBoosters, createBooster, getBoosterFilterCards, getBoosters, toBoosterCardFilters } from "@/lib/db/boosters";
import { getGameBySlugOrId } from "@/lib/db/games";
import { isBoosterType, normalizeBoosterType } from "@/lib/constants/booster-types";
import { parseBoosterCardIds } from "@/lib/constants/boosters";

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

  const searchParams = request.nextUrl.searchParams;
  const typeParam = searchParams.get("type");
  const normalizedType = typeParam ? normalizeBoosterType(typeParam) : undefined;
  if (normalizedType && !isBoosterType(game.slug, normalizedType)) {
    return NextResponse.json({ error: "Invalid booster type" }, { status: 400 });
  }
  const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(searchParams.get("limit") ?? "100", 10) || 100));

  const filterCards = await getBoosterFilterCards(game.id, parseBoosterCardIds(searchParams.get("cards")));

  const filters = {
    userId: session.user.id,
    gameId: game.id,
    type: normalizedType,
    cards: toBoosterCardFilters(filterCards),
  };
  const [boosters, total] = await Promise.all([
    getBoosters({ ...filters, page: page - 1, limit, sort }),
    countBoosters(filters),
  ]);

  return NextResponse.json({
    boosters,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
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
  const type = normalizeBoosterType(typeof body?.type === "string" ? body.type : undefined);

  if (!gameSlug || !setCode || !lang) {
    return NextResponse.json({ error: "Missing gameSlug, setCode or lang" }, { status: 400 });
  }

  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // Les types disponibles dépendent du jeu : on refuse un type d'un autre jeu
  // plutôt que de le stocker et de l'afficher dans une liste où il n'existe pas.
  if (!isBoosterType(game.slug, type)) {
    return NextResponse.json({ error: "Invalid booster type" }, { status: 400 });
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
