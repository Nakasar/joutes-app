import { NextResponse } from "next/server";
import { getGameBySlugOrId } from "@/lib/db/games";
import meilisearch, { indexes } from "@/lib/meilisearch";

const MAX_TEXT_LENGTH = 5000;
const MIN_LINE_LENGTH = 3;
// Meilisearch's built-in typo tolerance already fuzzy-matches OCR noise, so
// this only filters out the low-confidence hits it still returns for lines
// that don't correspond to any card name.
const RANKING_SCORE_THRESHOLD = 0.5;

type CardNameHit = { id: string; name: string };

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

  const indexConfig = game.slug ? indexes[game.slug] : undefined;
  if (!indexConfig) {
    return NextResponse.json({ match: null });
  }

  const index = meilisearch.index<CardNameHit>(indexConfig.name);

  const lines = text
    .split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => line.length >= MIN_LINE_LENGTH);

  let best: { item: CardNameHit; score: number } | null = null;
  for (const line of lines) {
    const result = await index.search(line, {
      limit: 1,
      attributesToSearchOn: ["name"],
      attributesToRetrieve: ["id", "name"],
      showRankingScore: true,
    });
    const [top] = result.hits;
    const score = top?._rankingScore;
    if (top && score !== undefined && score >= RANKING_SCORE_THRESHOLD && (!best || score > best.score)) {
      best = { item: { id: top.id, name: top.name }, score };
    }
  }

  return NextResponse.json({ match: best ? { ...best.item, score: best.score } : null });
}
