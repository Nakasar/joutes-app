import { notFound } from "next/navigation";
import { getQuizById } from "@/lib/db/quizzes";
import { hasPermission } from "@/lib/db/permissions";
import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Pencil, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ObjectId } from "mongodb";
import { resolveCardMentions } from "@/lib/game-content-cards";
import QuizPlayer from "./QuizPlayer";

type Props = { params: Promise<{ quizId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { quizId } = await params;
  const quiz = await getQuizById(quizId);
  if (!quiz) return { title: "Quizz introuvable" };
  return {
    title: quiz.title,
    openGraph: {
      title: quiz.title,
    },
  };
}

export default async function QuizzDetailPage({ params }: Props) {
  const { quizId } = await params;

  const [quiz, canWrite] = await Promise.all([
    getQuizById(quizId),
    hasPermission("quizzes:update").catch(() => false),
  ]);

  if (!quiz) {
    notFound();
  }

  const texts = quiz.blocks.flatMap((block) =>
    block.type === "markdown"
      ? [block.content]
      : block.questions.flatMap((question) => [
          question.prompt,
          ...(question.options ?? []).map((option) => option.text),
          question.correctFeedback ?? "",
          question.incorrectFeedback ?? "",
        ])
  );

  const { cardIdByName, cardsById } = quiz.gameId
    ? await resolveCardMentions(new ObjectId(quiz.gameId), texts)
    : { cardIdByName: {}, cardsById: {} };
  const gameSlug = quiz.game?.slug ?? "riftbound";

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/quizz">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux quizz
          </Link>
        </Button>
        {canWrite && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/quizz/${quizId}/edit`}>
              <Pencil className="h-4 w-4 mr-2" />
              Modifier
            </Link>
          </Button>
        )}
      </div>

      <article className="space-y-6">
        <header className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">{quiz.title}</h1>
          {quiz.game && (
            <Badge variant="secondary" className="gap-1">
              <Gamepad2 className="h-3 w-3" />
              {quiz.game.name}
            </Badge>
          )}
        </header>

        <QuizPlayer blocks={quiz.blocks} cardIdByName={cardIdByName} cardsById={cardsById} gameSlug={gameSlug} />
      </article>
    </div>
  );
}
