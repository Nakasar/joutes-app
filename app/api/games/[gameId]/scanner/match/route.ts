import { NextResponse } from "next/server";
import { getGameBySlugOrId } from "@/lib/db/games";
import meilisearch, { indexes } from "@/lib/meilisearch";

const MAX_TEXT_LENGTH = 5000;
const MIN_TEXT_LENGTH = 3;
// The client now crops OCR to the card's name band before sending text here,
// so this is a single, already name-scoped candidate string rather than a
// full block of card text — one Meilisearch query is enough.
// Meilisearch's built-in typo tolerance already fuzzy-matches OCR noise, so
// this only filters out the low-confidence hits it still returns when the
// text doesn't correspond to any card name.
const RANKING_SCORE_THRESHOLD = 0.55;

type CardNameHit = { id: string; name: string };

export async function POST(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: { message: "Game not found" } }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }
  const { text, lang } = (body ?? {}) as { text?: unknown; lang?: unknown };

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: { message: "Invalid text in body." } }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: { message: `Text is too long (max ${MAX_TEXT_LENGTH} characters).` } },
      { status: 400 }
    );
  }

  const trimmedText = text.trim();
  if (trimmedText.length < MIN_TEXT_LENGTH) {
    return NextResponse.json({ match: null });
  }

  const indexConfig = game.slug ? indexes[game.slug] : undefined;
  if (!indexConfig) {
    return NextResponse.json({ match: null });
  }

  const index = meilisearch.index<CardNameHit>(indexConfig.name);

  const filter: string[] = [];
  if (typeof lang === "string" && lang.trim()) {
    filter.push(`lang = ${lang.trim()}`);
  }

  const result = await index.search(trimmedText, {
    limit: 1,
    attributesToSearchOn: ["name"],
    attributesToRetrieve: ["id", "name"],
    showRankingScore: true,
    filter: filter.length > 0 ? filter : undefined,
  });

  const [top] = result.hits;
  const score = top?._rankingScore;
  const match =
    top && score !== undefined && score >= RANKING_SCORE_THRESHOLD ? { id: top.id, name: top.name, score } : null;

  return NextResponse.json({ match });
}
