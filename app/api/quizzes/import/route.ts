import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/db/permissions";
import { getGameById } from "@/lib/db/games";
import { getAllCardNamesById } from "@/lib/db/cards";
import { createCardMentionBracketer } from "@/lib/loop-markdown";
import { toQuizBlocks, toQuizTitle, type ImportedBlock } from "@/lib/quizzes/import";

/** Même borne que la loupe : de quoi coller un fil de discussion entier. */
const MAX_TEXT_LENGTH = 20000;

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

/**
 * Ce qu'on demande au modèle. Pas d'identifiants ni de références croisées :
 * les bonnes réponses sont désignées par leur rang, tout le reste est rétabli
 * par `toQuizBlocks`. Les champs facultatifs sont déclarés `nullable` plutôt
 * qu'`optional`, la forme que les sorties structurées rendent le plus
 * fidèlement.
 */
const importedQuestionSchema = z.object({
  type: z.enum(["single", "multiple", "text", "number"]),
  prompt: z.string(),
  options: z.array(z.string()).nullable(),
  correctOptionIndexes: z.array(z.number().int()).nullable(),
  correctText: z.string().nullable(),
  correctNumber: z.number().nullable(),
  correctFeedback: z.string().nullable(),
  incorrectFeedback: z.string().nullable(),
});

const importedBlockSchema = z.object({
  type: z.enum(["markdown", "form"]),
  content: z.string().nullable(),
  questions: z.array(importedQuestionSchema).nullable(),
});

const importedQuizSchema = z.object({
  title: z.string(),
  blocks: z.array(importedBlockSchema),
});

const IMPORT_PROMPT = `You turn a raw text — a rules discussion, a "question of the day" post, a FAQ, a forum thread — into a quiz.

Read the text and produce:
- title: a short title for the quiz, in the language of the text.
- blocks: an ordered list of blocks that reads as a quiz.

Two block types:
- "markdown": prose shown to the player. Use it for the setup, the scenario, or the explanation that follows the questions. Set "content", leave "questions" null.
- "form": one or more questions. Set "questions", leave "content" null.

Rules for the questions:
- Every question the text asks should become a question. Keep the wording of the original question when it is already a question.
- type "single" when exactly one answer is right, "multiple" when several are, "text" for a short free-form answer, "number" for a numeric one.
- For "single" and "multiple": give at least 2 plausible options and list the 0-based positions of the right ones in correctOptionIndexes. When the source answers with a nuance ("unknown", "leaning towards yes"), make that nuance one of the options rather than forcing a yes/no.
- For "text": correctText is the expected answer, short and without brackets. For "number": correctNumber is the expected value.
- correctFeedback and incorrectFeedback carry the explanation the text gives for that question — this is where the reasoning, the rule numbers and the caveats belong. Leave them null when the text explains nothing.
- Set to null every field that does not apply to the question's type.

Write in the language of the source text. Copy the names of cards, rules and keywords exactly as the text spells them — they are matched against a card database afterwards, so any rewording loses the link. Do not add brackets around them yourself.

Do not invent rules answers the text does not give. If the text leaves a question open, say so in the options and in the feedback.`;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Écrire un quizz est ouvert à tous, mais pas le faire écrire par un modèle :
  // chaque appel consomme du crédit chez le fournisseur, d'où un droit dédié,
  // comme `scanner:ai` pour la reconnaissance de cartes.
  if (!(await hasPermission("quizzes:ai-import"))) {
    return NextResponse.json(
      { error: "Permission refusée : l'import par IA nécessite le droit quizzes:ai-import" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { text, gameId } = (body ?? {}) as { text?: unknown; gameId?: unknown };

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Le texte à analyser est requis" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Le texte est trop long (${MAX_TEXT_LENGTH} caractères maximum)` },
      { status: 400 }
    );
  }
  if (gameId !== undefined && gameId !== "" && (typeof gameId !== "string" || !objectIdPattern.test(gameId))) {
    return NextResponse.json({ error: "Paramètre gameId invalide" }, { status: 400 });
  }

  let imported: z.infer<typeof importedQuizSchema>;
  try {
    const result = await generateObject({
      model: openai("gpt-5.4-mini"),
      schema: importedQuizSchema,
      messages: [
        { role: "system", content: IMPORT_PROMPT },
        { role: "user", content: text },
      ],
    });
    imported = result.object;
  } catch (error) {
    console.error("Erreur lors de l'analyse du texte du quizz:", error);
    return NextResponse.json({ error: "L'analyse du texte a échoué" }, { status: 502 });
  }

  // Détection des cartes : la même que la loupe, appliquée à chaque texte
  // affiché du quizz. Sans jeu rattaché, il n'y a pas de catalogue où chercher.
  let annotate: ((value: string) => string) | undefined;
  if (typeof gameId === "string" && gameId) {
    const game = await getGameById(gameId);
    if (!game) {
      return NextResponse.json({ error: "Jeu non trouvé" }, { status: 404 });
    }
    const cardNames = (await getAllCardNamesById(new ObjectId(gameId))).map((card) => card.name);
    annotate = createCardMentionBracketer(cardNames);
  }

  const blocks = toQuizBlocks(imported.blocks as ImportedBlock[], { annotate });

  if (blocks.length === 0) {
    return NextResponse.json(
      { error: "Aucune question n'a pu être tirée de ce texte" },
      { status: 422 }
    );
  }

  return NextResponse.json({ title: toQuizTitle(imported.title), blocks });
}
