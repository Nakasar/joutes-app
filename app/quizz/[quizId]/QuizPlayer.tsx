"use client";

import { useMemo, useState } from "react";
import { Quiz, QuizQuestion } from "@/lib/types/Quiz";
import type { CardNameMatch } from "@/lib/db/cards";
import { Gamepad2 } from "lucide-react";
import AnnotatedMarkdown from "@/components/AnnotatedMarkdown";
import { Badge } from "@/components/ui/badge";
import LanguagePicker from "@/components/LanguagePicker";
import StaleTranslationWarning from "@/components/StaleTranslationWarning";
import { Button } from "@/components/ui/button";
import { availableQuizLangs, isTranslationStale, localizeQuiz } from "@/lib/quizzes/translate";
import type { Locale } from "@/i18n/config";
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
  quiz,
  interfaceLocale,
  gameName,
  cardIdByName,
  cardsById,
  gameSlug,
}: {
  quiz: Quiz;
  /** Langue de l'utilisateur : le quizz s'y affiche s'il y est traduit. */
  interfaceLocale: Locale;
  gameName?: string;
  cardIdByName: Record<string, string>;
  cardsById: Record<string, CardNameMatch>;
  gameSlug: string;
}) {
  const availableLangs = availableQuizLangs(quiz);
  const [selectedLang, setSelectedLang] = useState<Locale>(
    availableLangs.includes(interfaceLocale) ? interfaceLocale : quiz.originalLang
  );

  // Les identifiants ne changent pas d'une langue à l'autre : les réponses
  // déjà données et leur correction survivent donc au changement de langue.
  const localized = useMemo(() => localizeQuiz(quiz, selectedLang), [quiz, selectedLang]);
  const blocks = localized.blocks;
  const translation = quiz.translations?.find((tr) => tr.lang === selectedLang);
  const isStale = !!translation && isTranslationStale(translation, quiz.updatedAt);

  const [answers, setAnswers] = useState<Record<string, QuizAnswerValue>>({});
  const [results, setResults] = useState<Record<string, boolean>>({});

  // A validation button checks every question since the previous validation
  // button (or since the start of the quiz, for the first one) — not the
  // whole quiz over again — so a multi-section quiz can have one button per
  // section without re-grading earlier sections each time.
  const validateBlock = (blockIndex: number) => {
    let startIndex = 0;
    for (let i = blockIndex - 1; i >= 0; i--) {
      const previousBlock = blocks[i];
      if (previousBlock.type === "form" && previousBlock.showSubmitButton) {
        startIndex = i + 1;
        break;
      }
    }

    const nextResults = { ...results };
    for (let i = startIndex; i <= blockIndex; i++) {
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
      <header className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">{localized.title}</h1>
        {gameName && (
          <Badge variant="secondary" className="gap-1">
            <Gamepad2 className="h-3 w-3" />
            {gameName}
          </Badge>
        )}
      </header>

      {availableLangs.length > 1 && (
        <div className="flex items-center justify-end">
          <LanguagePicker
            availableLangs={availableLangs}
            originalLang={quiz.originalLang}
            value={selectedLang}
            onChange={setSelectedLang}
            originalLabel="VO"
            ariaLabel="Langue du quizz"
          />
        </div>
      )}

      {isStale && (
        <StaleTranslationWarning message="Le quizz a été modifié depuis cette traduction : certains textes peuvent être en version originale ou dépassés." />
      )}

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
              <Button type="button" onClick={() => validateBlock(index)}>
                Valider
              </Button>
            )}
          </div>
        )
      )}
    </div>
  );
}
