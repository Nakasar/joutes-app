import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getNews } from "@/lib/db/news.ts";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { GameToolGridSkeleton } from "@/components/games/GameToolSkeletons.tsx";
import NewsCard from "./NewsCard.tsx";

const PAGE_SIZE = 9;

type GameParams = Promise<{ gameSlugOrId: string }>;

interface GameNewsPageProps {
  params: GameParams;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: GameNewsPageProps): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.news");

  if (!game) {
    return {
      title: t("metadata.notFoundTitle"),
    };
  }

  return {
    title: t("metadata.title", { gameName: game.name }),
    description: t("metadata.description", { gameName: game.name }),
    openGraph: {
      url: `https://joutes.app/games/${gameSlugOrId}/news`,
      title: t("metadata.title", { gameName: game.name }),
      description: t("metadata.description", { gameName: game.name }),
      images: game.banner ? [game.banner] : [],
    },
  };
}

/**
 * Deux frontières : l'en-tête ne dépend que du jeu, la liste dépend en plus de
 * la session — elle décide de ce que chaque carte propose — et de la page
 * demandée. Les séparer garde le titre en place quand on tourne les pages.
 */
export default function GameNewsPage({ params, searchParams }: GameNewsPageProps) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      <Suspense fallback={<NewsHeaderSkeleton />}>
        <NewsHeader params={params} />
      </Suspense>

      <Suspense fallback={<GameToolGridSkeleton />}>
        <NewsList params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function NewsHeaderSkeleton() {
  return (
    <div className="flex animate-pulse flex-row flex-wrap items-center gap-4" aria-hidden>
      <div className="h-9 w-28 rounded-md bg-muted" />
      <div className="h-9 w-72 max-w-full rounded bg-muted" />
    </div>
  );
}

async function NewsHeader({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);

  if (!game) {
    notFound();
  }

  const t = await getTranslations("Games.news");

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

async function NewsList({ params, searchParams }: GameNewsPageProps) {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);

  if (!game) {
    notFound();
  }

  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const session = await auth.api.getSession({ headers: await headers() });

  const [t, { news, totalPages }] = await Promise.all([
    getTranslations("Games.news"),
    getNews({
      gameId: game.id,
      page: currentPage,
      limit: PAGE_SIZE,
      userId: session?.user?.id,
    }),
  ]);

  return (
    <div className="space-y-6">
      {news.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">{t("empty")}</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {news.map((item) => (
            <NewsCard key={item.id} news={item} isLoggedIn={!!session?.user?.id} />
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
              <Link href={`/games/${game.slug ?? gameSlugOrId}/news?page=${currentPage - 1}`}>
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
              <Link href={`/games/${game.slug ?? gameSlugOrId}/news?page=${currentPage + 1}`}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
