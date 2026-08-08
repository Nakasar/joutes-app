import { notFound } from "next/navigation";
import { getQuizById } from "@/lib/db/quizzes";
import { canManageQuiz } from "@/lib/quizzes/authorization";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ObjectId } from "mongodb";
import { resolveCardMentions } from "@/lib/game-content-cards";
import { quizContentTexts } from "@/lib/quizzes/content";
import { getLocale } from "next-intl/server";
import { localizeQuiz } from "@/lib/quizzes/translate";
import type { Locale } from "@/i18n/config";
import QuizPlayer from "./QuizPlayer";
import QuizTranslateMenu from "./QuizTranslateMenu";
import DeleteQuizButton from "./DeleteQuizButton";
import ReportButton from "@/components/ReportButton";

type Props = { params: Promise<{ quizId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { quizId } = await params;
  const quiz = await getQuizById(quizId);
  if (!quiz) return { title: "Quizz introuvable" };

  const title = localizeQuiz(quiz, (await getLocale()) as Locale).title;
  return {
    title,
    openGraph: {
      title,
    },
  };
}

export default async function QuizzDetailPage({ params }: Props) {
  const { quizId } = await params;

  const [quiz, session] = await Promise.all([
    getQuizById(quizId),
    auth.api.getSession({ headers: await headers() }),
  ]);

  if (!quiz) {
    notFound();
  }

  // Son auteur, ou la modération (`quizzes:update-all`) : c'est ce qui ouvre la
  // modification, la traduction et la suppression.
  const canWrite = await canManageQuiz(quiz, session?.user?.id).catch(() => false);

  // `quizContentTexts` inclut les traductions : le lecteur change de langue
  // sans aller-retour serveur, les cartes qu'elles mentionnent doivent donc
  // être connues d'avance. `GET /quizzes/{quizId}` résout le même ensemble,
  // pour l'application mobile.
  const { cardIdByName, cardsById } = quiz.gameId
    ? await resolveCardMentions(new ObjectId(quiz.gameId), quizContentTexts(quiz))
    : { cardIdByName: {}, cardsById: {} };
  const gameSlug = quiz.game?.slug ?? "riftbound";
  const locale = (await getLocale()) as Locale;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/quizz">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux quizz
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {canWrite && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/quizz/${quizId}/edit`}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Modifier
                </Link>
              </Button>
              <QuizTranslateMenu
                quizId={quiz.id}
                originalLang={quiz.originalLang}
                translatedLangs={(quiz.translations ?? []).map((translation) => translation.lang)}
              />
              <DeleteQuizButton quizId={quiz.id} />
            </>
          )}
          <ReportButton contentType="quiz" contentId={quiz.id} />
        </div>
      </div>

      <article className="space-y-6">
        <QuizPlayer
          quiz={quiz}
          interfaceLocale={locale}
          gameName={quiz.game?.name}
          cardIdByName={cardIdByName}
          cardsById={cardsById}
          gameSlug={gameSlug}
        />
      </article>
    </div>
  );
}
