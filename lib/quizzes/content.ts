import type { Quiz } from "@/lib/types/Quiz";

/**
 * Every field of a quiz that is rendered as markdown, original and translated
 * alike: block content, question prompts, option texts and both feedbacks.
 *
 * Quiz prose is annotated markdown: `[Card Name]` mentions, keyword brackets
 * and `:icon:` tags. Resolving those mentions means knowing, up front, every
 * text a reader might end up looking at — and a reader switches language
 * without a round-trip, so the translations count too.
 *
 * Titles are deliberately out: quiz and translation titles are rendered as
 * plain text (a heading, a mobile back bar), so a mention written in one would
 * stay a mention whether or not it resolved.
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

  // A translation entry only ever declares string fields, but it comes back
  // from Mongo: `typeof` narrows and guards at once, where a hand-written
  // predicate would only have asserted.
  const fromTranslations = (quiz.translations ?? []).flatMap((translation) =>
    Object.values(translation.entries ?? {}).flatMap((entry) =>
      Object.values(entry).filter((value) => typeof value === "string" && value !== "")
    )
  );

  return [...fromBlocks, ...fromTranslations].filter(Boolean);
}
