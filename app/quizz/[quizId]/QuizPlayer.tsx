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
import { isCorrect, questionsValidatedBy, toAnswerPayload } from "@/lib/quizzes/grade";
import type { Locale } from "@/i18n/config";
import QuizQuestionPlayer, { type QuizAnswerValue } from "./QuizQuestionPlayer";

/** Score d'une section, tel qu'affiché à côté de son bouton de validation. */
type SectionScore = { correct: number; total: number };

export default function QuizPlayer({
  quiz,
  interfaceLocale,
  gameName,
  cardIdByName,
  cardsById,
  gameSlug,
  isSignedIn,
}: {
  quiz: Quiz;
  /** Langue de l'utilisateur : le quizz s'y affiche s'il y est traduit. */
  interfaceLocale: Locale;
  gameName?: string;
  cardIdByName: Record<string, string>;
  cardsById: Record<string, CardNameMatch>;
  gameSlug: string;
  /** Un score n'est enregistré que s'il y a un profil où le ranger. */
  isSignedIn: boolean;
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
  /** Score de chaque section validée, indexé par l'identifiant de son bloc. */
  const [scores, setScores] = useState<Record<string, SectionScore>>({});

  // La correction se fait ici, pour répondre sans attendre le réseau. Le score
  // enregistré est en revanche celui que le serveur recalcule : lui seul ne
  // dépend pas de ce que le navigateur veut bien annoncer.
  const validateBlock = (blockIndex: number) => {
    const questions = questionsValidatedBy(blocks, blockIndex);
    const nextResults = { ...results };
    let correct = 0;

    for (const question of questions) {
      const result = isCorrect(question, answers[question.id]);
      nextResults[question.id] = result;
      if (result) correct += 1;
    }

    const block = blocks[blockIndex];
    setResults(nextResults);
    setScores((previous) => ({ ...previous, [block.id]: { correct, total: questions.length } }));

    if (isSignedIn) {
      // L'enregistrement ne conditionne pas l'affichage : un score qui ne part
      // pas ne doit pas priver le joueur de sa correction.
      fetch(`/api/quizzes/${quiz.id}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId: block.id, answers: toAnswerPayload(answers) }),
      })
        .then((response) => {
          // `fetch` ne rejette que sur une panne réseau : un refus du serveur
          // passerait sans bruit sans ce contrôle.
          if (!response.ok) {
            console.error("Score de quizz refusé par le serveur:", response.status);
          }
        })
        .catch((error) => {
          console.error("Score de quizz non enregistré:", error);
        });
    }
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
              <div className="flex items-center gap-3">
                <Button type="button" onClick={() => validateBlock(index)}>
                  Valider
                </Button>
                {scores[block.id] && (
                  <p className="text-sm font-medium" aria-live="polite">
                    {scores[block.id].correct} / {scores[block.id].total}{" "}
                    <span className="font-normal text-muted-foreground">
                      {/* Le français met au singulier après zéro comme après
                          un — c'est aussi la règle CLDR. Un bloc formulaire
                          exigeant au moins une question, le cas ne se
                          présente de toute façon pas. */}
                      {scores[block.id].total > 1 ? "bonnes réponses" : "bonne réponse"}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
