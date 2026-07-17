import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import Fuse from "fuse.js";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getAllCardNamesById } from "@/lib/db/cards";

const MAX_TEXT_LENGTH = 5000;
const MATCH_SCORE_THRESHOLD = 0.45;
const MIN_LINE_LENGTH = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;

type CardNameEntry = { id: string; name: string };

// Card names rarely change mid-session, so the per-game Fuse index is cached
// for a few minutes to avoid rebuilding it (and re-querying Mongo) on every
// single OCR frame while a client is actively scanning.
const fuseCache = new Map<string, { fuse: Fuse<CardNameEntry>; expiresAt: number }>();

async function getFuseForGame(gameObjectId: ObjectId): Promise<Fuse<CardNameEntry>> {
  const key = gameObjectId.toString();
  const cached = fuseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.fuse;
  }

  const names = await getAllCardNamesById(gameObjectId);
  const fuse = new Fuse(names, {
    keys: ["name"],
    threshold: MATCH_SCORE_THRESHOLD,
    ignoreLocation: true,
    minMatchCharLength: MIN_LINE_LENGTH,
  });
  fuseCache.set(key, { fuse, expiresAt: Date.now() + CACHE_TTL_MS });
  return fuse;
}

export async function POST(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: { message: "Game not found" } }, { status: 404 });
  }

  const body = await request.json();
  const { text } = body;

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: { message: "Invalid text in body." } }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: { message: `Text is too long (max ${MAX_TEXT_LENGTH} characters).` } },
      { status: 400 }
    );
  }

  const fuse = await getFuseForGame(new ObjectId(game.id));

  const lines = text
    .split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => line.length >= MIN_LINE_LENGTH);

  let best: { item: CardNameEntry; score: number } | null = null;
  for (const line of lines) {
    const [top] = fuse.search(line);
    if (top && top.score !== undefined && (!best || top.score < best.score)) {
      best = { item: top.item, score: top.score };
    }
  }

  return NextResponse.json({ match: best ? { ...best.item, score: best.score } : null });
}
