import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getQuizzes } from "@/lib/db/quizzes.ts";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import QuizCard from "./QuizCard.tsx";
import { QuizzHeaderSkeleton, QuizzListSkeleton } from "./QuizzSkeletons.tsx";

const PAGE_SIZE = 9;

type GameParams = Promise<{ gameSlugOrId: string }>;

interface GameQuizzPageProps {
  params: GameParams;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: GameQuizzPageProps): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const [t, tQuizz] = await Promise.all([
    getTranslations("Games.quizz"),
    getTranslations("Quizz.metadata"),
  ]);

  if (!game) {
    return { title: t("metadata.notFoundTitle") };
  }

  const title = t("metadata.title", { gameName: game.name });
  const description = t("metadata.description", { gameName: game.name });

  return {
    title,
    description,
    // Ce qu'on cherche avant de trouver un quizz : le jeu, et ce sur quoi on
    // veut se tester. La liste est traduite avec le reste.
    keywords: [game.name, ...tQuizz("keywords").split(",").map((keyword) => keyword.trim())],
    openGraph: {
      url: `https://joutes.app/games/${gameSlugOrId}/quizz`,
      title,
      description,
      images: game.banner ? [game.banner] : [],
    },
  };
}

/**
 * Deux frontières plutôt qu'une : l'en-tête ne dépend que du jeu, la liste
 * dépend en plus de la page demandée. Les séparer garde le titre en place
 * quand on tourne les pages, au lieu de le faire clignoter avec la liste.
 *
 * La page ne fait plus qu'assembler : les promesses `params` et `searchParams`
 * descendent telles quelles, et ne sont attendues que sous frontière. Les
 * attendre ici rendrait toute la route dynamique.
 */
export default function GameQuizzPage({ params, searchParams }: GameQuizzPageProps) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      <Suspense fallback={<QuizzHeaderSkeleton />}>
        <QuizzHeader params={params} />
      </Suspense>

      <Suspense fallback={<QuizzListSkeleton />}>
        <QuizzList params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function QuizzHeader({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);

  if (!game) {
    notFound();
  }

  const t = await getTranslations("Games.quizz");

  return (
    <div className="flex flex-row flex-wrap items-center gap-4">
      <Button asChild variant="outline">
        <Link href={`/games/${game.slug ?? gameSlugOrId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("back")}
        </Link>
      </Button>
      <h1 className="text-3xl font-bold">{t("title", { gameName: game.name })}</h1>
    </div>
  );
}

async function QuizzList({ params, searchParams }: GameQuizzPageProps) {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);

  if (!game) {
    notFound();
  }

  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const [t, { quizzes, totalPages }] = await Promise.all([
    getTranslations("Games.quizz"),
    getQuizzes({ gameId: game.id, page: currentPage, limit: PAGE_SIZE }),
  ]);

  return (
    <div className="space-y-6">
      {quizzes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">{t("empty")}</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {quizzes.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-4">
          {currentPage <= 1 ? (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href={`/games/${game.slug ?? gameSlugOrId}/quizz?page=${currentPage - 1}`}>
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {t("pageLabel", { currentPage, totalPages })}
          </span>
          {currentPage >= totalPages ? (
            <Button variant="outline" size="sm" disabled>
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href={`/games/${game.slug ?? gameSlugOrId}/quizz?page=${currentPage + 1}`}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
