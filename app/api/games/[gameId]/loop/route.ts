import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getAllCardNamesById, getCardsByIds } from "@/lib/db/cards";
import { getErratasByCardId } from "@/lib/db/erratas";
import { annotateErrataMarkdown } from "@/lib/errata-markdown";
import { bracketPlainCardMentions } from "@/lib/loop-markdown";

const MAX_TEXT_LENGTH = 20000;

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

  const gameObjectId = new ObjectId(game.id);
  const cardEntries = await getAllCardNamesById(gameObjectId);
  const cardIdByName = new Map(cardEntries.map((c) => [c.name.toLowerCase(), c.id]));

  const bracketed = bracketPlainCardMentions(text, cardEntries.map((c) => c.name));
  const annotated = annotateErrataMarkdown(bracketed, cardIdByName);

  const mentionedIds = [...new Set([...annotated.matchAll(/\]\(card:\/\/([^)]+)\)/g)].map((m) => m[1]))];
  // Keep the order cards first appear in the annotated text, so the summary
  // list below reads in the same order as the analysis itself.
  mentionedIds.sort((a, b) => annotated.indexOf(`(card://${a})`) - annotated.indexOf(`(card://${b})`));

  const [matchedCards, erratasByCardId] = await Promise.all([
    getCardsByIds(gameObjectId, mentionedIds),
    Promise.all(mentionedIds.map(async (id) => [id, await getErratasByCardId(id)] as const)),
  ]);
  const cardsById = new Map(matchedCards.map((c) => [c.id, c]));
  const erratasById = new Map(erratasByCardId);

  const cards = mentionedIds
    .map((id) => cardsById.get(id))
    .filter((card): card is NonNullable<typeof card> => !!card)
    .map((card) => ({ ...card, erratas: erratasById.get(card.id) ?? [] }));

  return NextResponse.json({
    raw: text,
    annotated,
    cards,
  });
}
