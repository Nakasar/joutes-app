import { getGameBySlugOrId } from "@/lib/db/games";
import { getQuizzes } from "@/lib/db/quizzes";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import QuizCard from "./QuizCard";

const PAGE_SIZE = 9;

interface GameQuizzPageProps {
  params: Promise<{ gameSlugOrId: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: GameQuizzPageProps): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await getGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.quizz");

  if (!game) {
    return { title: t("metadata.notFoundTitle") };
  }

  return {
    title: t("metadata.title", { gameName: game.name }),
    description: t("metadata.description", { gameName: game.name }),
    openGraph: {
      url: `https://joutes.app/games/${gameSlugOrId}/quizz`,
      title: t("metadata.title", { gameName: game.name }),
      description: t("metadata.description", { gameName: game.name }),
      images: game.banner ? [game.banner] : [],
    },
  };
}

export default async function GameQuizzPage({ params, searchParams }: GameQuizzPageProps) {
  const { gameSlugOrId } = await params;
  const game = await getGameBySlugOrId(gameSlugOrId);

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
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      <div className="flex flex-row flex-wrap items-center gap-4">
        <Button asChild variant="outline">
          <Link href={`/games/${game.slug ?? gameSlugOrId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("back")}
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">{t("title", { gameName: game.name })}</h1>
      </div>

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
        <div className="flex items-center justify-center gap-4">
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
