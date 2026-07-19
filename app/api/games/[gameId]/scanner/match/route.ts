import { NextResponse } from "next/server";
import { getGameBySlugOrId } from "@/lib/db/games";
import { matchCardNameInMeilisearch } from "@/lib/scanner";

const MAX_TEXT_LENGTH = 5000;
const MIN_TEXT_LENGTH = 3;

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

  const match = await matchCardNameInMeilisearch(game.slug, trimmedText, {
    lang: typeof lang === "string" && lang.trim() ? lang.trim() : undefined,
  });

  return NextResponse.json({ match });
}
