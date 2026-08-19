import { Link } from "@/i18n/navigation.ts";
import { Gamepad2 } from "lucide-react";
import type { QuizScoreEntry } from "@/lib/db/quiz-scores.ts";

/**
 * Scores obtenus sur les sections de quizz, de la plus récente validation à la
 * plus ancienne.
 *
 * Un quizz peut compter plusieurs sections ; chacune a sa ligne. Le titre du
 * quizz s'y répète donc, ce qui est plus lisible qu'un regroupement : les
 * sections n'ont pas de nom à afficher, seulement un rang qui ne dirait rien.
 */
export default function QuizScores({ scores }: { scores: QuizScoreEntry[] }) {
  if (scores.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Aucun quizz validé pour l&apos;instant. Vos scores apparaîtront ici.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {scores.map((score) => (
        <li
          key={`${score.quizId}-${score.blockId}`}
          className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <Link href={`/quizz/${score.quizId}`} className="text-sm font-medium hover:underline">
              {score.quizTitle}
            </Link>
            {score.gameName && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Gamepad2 className="h-3 w-3 shrink-0" />
                {score.gameName}
              </p>
            )}
          </div>
          <p className="shrink-0 text-sm font-semibold tabular-nums">
            {score.correct} / {score.total}
          </p>
        </li>
      ))}
    </ul>
  );
}
