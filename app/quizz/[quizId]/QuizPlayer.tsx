"use client";

import { useState } from "react";
import { QuizBlock, QuizQuestion } from "@/lib/types/Quiz";
import type { CardNameMatch } from "@/lib/db/cards";
import AnnotatedMarkdown from "@/components/AnnotatedMarkdown";
import { Button } from "@/components/ui/button";
import QuizQuestionPlayer, { type QuizAnswerValue } from "./QuizQuestionPlayer";

function isCorrect(question: QuizQuestion, answer: QuizAnswerValue): boolean {
  switch (question.type) {
    case "single": {
      const correct = question.correctOptionIds?.[0];
      return !!correct && answer === correct;
    }
    case "multiple": {
      const correctIds = question.correctOptionIds ?? [];
      const given = Array.isArray(answer) ? answer : [];
      return correctIds.length === given.length && correctIds.every((id) => given.includes(id));
    }
    case "text": {
      const expected = (question.correctText ?? "").trim().toLowerCase();
      const given = typeof answer === "string" ? answer.trim().toLowerCase() : "";
      return !!expected && given === expected;
    }
    case "number":
      return question.correctNumber !== undefined && typeof answer === "number" && answer === question.correctNumber;
  }
}

export default function QuizPlayer({
  blocks,
  cardIdByName,
  cardsById,
  gameSlug,
}: {
  blocks: QuizBlock[];
  cardIdByName: Record<string, string>;
  cardsById: Record<string, CardNameMatch>;
  gameSlug: string;
}) {
  const [answers, setAnswers] = useState<Record<string, QuizAnswerValue>>({});
  const [results, setResults] = useState<Record<string, boolean>>({});

  // A validation button checks every question up to and including its own
  // block, not just the block it's attached to — matching a quiz built from
  // several sections, each with its own "check my answers so far" button.
  const validateUpToBlock = (blockIndex: number) => {
    const nextResults = { ...results };
    for (let i = 0; i <= blockIndex; i++) {
      const block = blocks[i];
      if (block.type !== "form") continue;
      for (const question of block.questions) {
        nextResults[question.id] = isCorrect(question, answers[question.id]);
      }
    }
    setResults(nextResults);
  };

  return (
    <div className="space-y-6">
      {blocks.map((block, index) =>
        block.type === "markdown" ? (
          <div key={block.id} className="prose prose-neutral dark:prose-invert max-w-none">
            <AnnotatedMarkdown
              content={block.content}
              cardIdByName={cardIdByName}
              cardsById={cardsById}
              gameSlug={gameSlug}
              ruleLang="fr"
            />
          </div>
        ) : (
          <div key={block.id} className="space-y-4">
            {block.questions.map((question) => (
              <QuizQuestionPlayer
                key={question.id}
                question={question}
                answer={answers[question.id]}
                onAnswerChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
                result={results[question.id]}
                cardIdByName={cardIdByName}
                cardsById={cardsById}
                gameSlug={gameSlug}
              />
            ))}
            {block.showSubmitButton && (
              <Button type="button" onClick={() => validateUpToBlock(index)}>
                Valider
              </Button>
            )}
          </div>
        )
      )}
    </div>
  );
}
