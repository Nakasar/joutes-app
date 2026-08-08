import type { Quiz } from "@/lib/types/Quiz";

/**
 * Every free-text field of a quiz, original and translated alike.
 *
 * Quiz prose is annotated markdown: `[Card Name]` mentions, keyword brackets
 * and `:icon:` tags. Resolving those mentions means knowing, up front, every
 * text a reader might end up looking at — and a reader switches language
 * without a round-trip, so the translations count too.
 *
 * Shared between the quiz page and `GET /quizzes/{quizId}`, which must resolve
 * the same set: a card mentioned only in the Italian version has to be
 * resolvable before anyone picks Italian.
 */
export function quizContentTexts(quiz: Pick<Quiz, "blocks" | "translations">): string[] {
  const fromBlocks = quiz.blocks.flatMap((block) =>
    block.type === "markdown"
      ? [block.content]
      : block.questions.flatMap((question) => [
          question.prompt,
          ...(question.options ?? []).map((option) => option.text),
          question.correctFeedback ?? "",
          question.incorrectFeedback ?? "",
        ])
  );

  const fromTranslations = (quiz.translations ?? []).flatMap((translation) =>
    Object.values(translation.entries ?? {}).flatMap((entry) =>
      Object.values(entry).filter((value): value is string => !!value)
    )
  );

  return [...fromBlocks, ...fromTranslations].filter(Boolean);
}
