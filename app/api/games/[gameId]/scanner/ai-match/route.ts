import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { getGameBySlugOrId } from "@/lib/db/games";
import { findCardByAiIdentification } from "@/lib/db/cards";
import { hasPermission } from "@/lib/db/permissions";
import { matchCardNameInMeilisearch, type ScannerMatch } from "@/lib/scanner";

// Base64 data URL length for a modest JPEG capture — generous enough for a
// full card photo, tight enough to keep this premium, paid-API route from
// being abused as a free-form image upload endpoint.
const MAX_IMAGE_LENGTH = 8_000_000;

const identificationSchema = z.object({
  cardName: z.string().nullable(),
  game: z.string().nullable(),
  collectorNumber: z.string().nullable(),
  setCode: z.string().nullable(),
  lang: z.string().nullable(),
});

const IDENTIFICATION_PROMPT = `Identify the trading card shown in this image. Extract only what's printed on the card itself:
- cardName: the card's name exactly as printed.
- game: the name of the trading card game (e.g. "Magic: The Gathering", "Star Wars Unlimited", "Riftbound") if you can identify it with confidence, otherwise null.
- collectorNumber: the card's collector/set number exactly as printed (e.g. "054", "12/292"), otherwise null.
- setCode: the set/edition code near the collector number (e.g. "SOC", "MOM", "TWI"), otherwise null.
- lang: the language of the card's text, as a two-letter ISO 639-1 code (en, fr, de, it, es, ja, ko, zh, ...), otherwise null.

If a field isn't legible or you're not confident, return null for it instead of guessing.`;

/**
 * Resolves a card match from an AI identification, retrying without the
 * set code once a lookup that used it comes up empty — collector number
 * and set code are the fields the model gets wrong most often, so a single
 * bad guess there shouldn't stop the name-based search from succeeding.
 */
async function resolveMatch(
  gameObjectId: ObjectId,
  gameSlug: string | undefined,
  identification: z.infer<typeof identificationSchema>
): Promise<ScannerMatch | null> {
  const exactMatch = await findCardByAiIdentification(gameObjectId, {
    name: identification.cardName,
    setCode: identification.setCode,
    collectorNumber: identification.collectorNumber,
    lang: identification.lang,
  });
  if (exactMatch) {
    return { id: exactMatch.id, name: exactMatch.name, score: 1 };
  }

  if (!identification.cardName) {
    return null;
  }

  const fuzzyMatch = await matchCardNameInMeilisearch(gameSlug, identification.cardName, {
    lang: identification.lang,
    setCode: identification.setCode,
  });
  if (fuzzyMatch || !identification.setCode) {
    return fuzzyMatch;
  }

  return matchCardNameInMeilisearch(gameSlug, identification.cardName, { lang: identification.lang });
}

export async function POST(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  if (!(await hasPermission("scanner:ai"))) {
    return NextResponse.json({ error: { message: "Not authorized." } }, { status: 403 });
  }

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
  const { image } = (body ?? {}) as { image?: unknown };

  if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: { message: "Invalid image in body." } }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_LENGTH) {
    return NextResponse.json({ error: { message: "Image is too large." } }, { status: 400 });
  }

  let identification: z.infer<typeof identificationSchema>;
  try {
    const result = await generateObject({
      model: openai("gpt-5.4-mini"),
      schema: identificationSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: IDENTIFICATION_PROMPT },
            { type: "image", image },
          ],
        },
      ],
    });
    identification = result.object;
  } catch (err) {
    console.error("Scanner AI identification error", err);
    return NextResponse.json({ error: { message: "AI identification failed." } }, { status: 502 });
  }

  const match = await resolveMatch(new ObjectId(game.id), game.slug, identification);

  return NextResponse.json({ match, identification });
}
