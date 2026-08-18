import { notFound } from "next/navigation";
import { getQuizById } from "@/lib/db/quizzes";
import { canManageQuiz } from "@/lib/quizzes/authorization";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ObjectId } from "mongodb";
import { resolveCardMentions } from "@/lib/game-content-cards";
import { quizContentTexts } from "@/lib/quizzes/content";
import { getLocale, getTranslations } from "next-intl/server";
import { localizeQuiz } from "@/lib/quizzes/translate";
import { quizIntroDescription } from "@/lib/quizzes/seo";
import type { Locale } from "@/i18n/config";
import QuizPlayer from "./QuizPlayer";
import QuizTranslateMenu from "./QuizTranslateMenu";
import DeleteQuizButton from "./DeleteQuizButton";
import ReportButton from "@/components/ReportButton";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type Props = { params: Promise<{ quizId: string }> };

/**
 * Un quizz n'a pas de champ « description » : ce qu'il a de mieux à dire de
 * lui-même est son introduction, le texte que l'auteur écrit avant la première
 * question. On la résume (`quizIntroDescription`), et à défaut on annonce ce
 * qu'un quizz fait travailler — règles, rulings, politiques de jeu — plutôt que
 * de laisser un moteur composer sa propre phrase à partir des questions.
 *
 * Le tout dans la langue du lecteur : le quizz lui-même est traduit, sa fiche
 * n'a pas de raison de rester française.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { quizId } = await params;
  const [quiz, t] = await Promise.all([getQuizById(quizId), getTranslations("Quizz.metadata")]);
  if (!quiz) return { title: t("notFoundTitle") };

  const localized = localizeQuiz(quiz, (await getLocale()) as Locale);
  const title = localized.title;
  const description =
    quizIntroDescription(localized.blocks) ??
    (quiz.game?.name
      ? t("quizDescription", { gameName: quiz.game.name })
      : t("quizDescriptionWithoutGame"));

  return {
    title,
    description,
    keywords: [
      ...(quiz.game?.name ? [quiz.game.name] : []),
      ...t("keywords").split(",").map((keyword) => keyword.trim()),
    ],
    openGraph: {
      type: "article",
      url: `https://joutes.app/quizz/${quizId}`,
      siteName: "Joutes",
      title,
      description,
      // L'icône du jeu est la seule image qu'un quizz porte : elle dit d'un
      // coup d'œil de quel jeu on va parler.
      images: quiz.game?.icon ? [quiz.game.icon] : [],
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
      <div className="flex flex-wrap items-center justify-between mb-6 gap-2">
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
          isSignedIn={!!session?.user?.id}
        />
      </article>
    </div>
  );
}
