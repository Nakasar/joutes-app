import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticleSkeleton } from "@/components/ArticleSkeleton.tsx";
import { getQuizById } from "@/lib/db/quizzes.ts";
import { canManageQuiz } from "@/lib/quizzes/authorization.ts";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Metadata } from "next";
import { Link } from "@/i18n/navigation.ts";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { ObjectId } from "mongodb";
import { resolveCardMentions } from "@/lib/game-content-cards.ts";
import { quizContentTexts } from "@/lib/quizzes/content.ts";
import { getLocale, getTranslations } from "next-intl/server";
import { localizeQuiz } from "@/lib/quizzes/translate.ts";
import { quizIntroDescription } from "@/lib/quizzes/seo.ts";
import { resolveQuizCover } from "@/lib/quizzes/cover.ts";
import { QuizCoverImage } from "@/components/quizzes/QuizCoverImage.tsx";
import type { Locale } from "@/i18n/config.ts";
import QuizPlayer from "./QuizPlayer.tsx";
import QuizTranslateMenu from "./QuizTranslateMenu.tsx";
import DeleteQuizButton from "./DeleteQuizButton.tsx";
import ReportButton from "@/components/ReportButton.tsx";

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

  // Même piège Mongo que dans le corps, à désarmer une seconde fois : les
  // métadonnées s'exécutent hors de la frontière de la page, avec leur propre
  // lecture du quizz.
  await connection();
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
      // La couverture d'abord : c'est l'image que son auteur a choisie pour
      // lui. À défaut, l'icône du jeu, qui dit au moins d'un coup d'œil de quel
      // jeu on va parler.
      images: quiz.coverImage ? [quiz.coverImage] : quiz.game?.icon ? [quiz.game.icon] : [],
    },
  };
}

/**
 * Une seule frontière : tout ce que cette page affiche vient du quizz et de la
 * session — il n'y a rien à en sortir qui tiendrait dans une coquille.
 */
export default function QuizzDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<QuizFallback />}>
      <QuizArticle params={params} />
    </Suspense>
  );
}

function QuizFallback() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <ArticleSkeleton paragraphs={4} />
    </div>
  );
}

async function QuizArticle({ params }: Props) {
  const { quizId } = await params;

  // Le pilote Mongo touche à l'horloge en lisant le quizz, ce qu'un prérendu ne
  // sait pas figer. Aucune frontière n'y change rien : c'est de la sync-IO, pas
  // une donnée de requête. `connection()` marque ce rendu comme lié à la
  // requête, ce qu'il est déjà — il lit la session juste après.
  await connection();

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
        <QuizCoverImage
          cover={resolveQuizCover(quiz)}
          title={quiz.title}
          className="aspect-[16/7] w-full rounded-lg border sm:aspect-[3/1]"
        />

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
