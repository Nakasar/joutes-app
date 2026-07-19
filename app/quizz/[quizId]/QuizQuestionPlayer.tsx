"use client";

import { QuizQuestion } from "@/lib/types/Quiz";
import type { CardNameMatch } from "@/lib/db/cards";
import AnnotatedMarkdown from "@/components/AnnotatedMarkdown";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle } from "lucide-react";

export type QuizAnswerValue = string | string[] | number | undefined;

export default function QuizQuestionPlayer({
  question,
  answer,
  onAnswerChange,
  result,
  cardIdByName,
  cardsById,
  gameSlug,
}: {
  question: QuizQuestion;
  answer: QuizAnswerValue;
  onAnswerChange: (value: QuizAnswerValue) => void;
  /** undefined = not validated yet. */
  result?: boolean;
  cardIdByName: Record<string, string>;
  cardsById: Record<string, CardNameMatch>;
  gameSlug: string;
}) {
  const annotated = (content: string) => (
    <AnnotatedMarkdown
      content={content}
      cardIdByName={cardIdByName}
      cardsById={cardsById}
      gameSlug={gameSlug}
      ruleLang="fr"
    />
  );

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="prose prose-sm dark:prose-invert max-w-none font-medium">{annotated(question.prompt)}</div>

      {(question.type === "single" || question.type === "multiple") && (
        <div className="space-y-2">
          {(question.options ?? []).map((option) => {
            const checked =
              question.type === "single"
                ? answer === option.id
                : Array.isArray(answer) && answer.includes(option.id);

            return (
              <label key={option.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type={question.type === "single" ? "radio" : "checkbox"}
                  name={question.id}
                  checked={checked}
                  onChange={() => {
                    if (question.type === "single") {
                      onAnswerChange(option.id);
                    } else {
                      const current = Array.isArray(answer) ? answer : [];
                      onAnswerChange(
                        current.includes(option.id)
                          ? current.filter((id) => id !== option.id)
                          : [...current, option.id]
                      );
                    }
                  }}
                  className="h-4 w-4 shrink-0"
                />
                <div className="prose prose-sm dark:prose-invert max-w-none">{annotated(option.text)}</div>
              </label>
            );
          })}
        </div>
      )}

      {question.type === "text" && (
        <Input
          value={typeof answer === "string" ? answer : ""}
          onChange={(e) => onAnswerChange(e.target.value)}
          placeholder="Votre réponse"
        />
      )}

      {question.type === "number" && (
        <Input
          type="number"
          value={typeof answer === "number" ? answer : ""}
          onChange={(e) => onAnswerChange(e.target.value === "" ? undefined : Number(e.target.value))}
          placeholder="Votre réponse"
        />
      )}

      {result !== undefined && (
        <div
          className={`flex items-start gap-2 rounded-md p-3 text-sm ${
            result
              ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
              : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {result ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {annotated((result ? question.correctFeedback : question.incorrectFeedback) || (result ? "Bonne réponse !" : "Mauvaise réponse."))}
          </div>
        </div>
      )}
    </div>
  );
}
