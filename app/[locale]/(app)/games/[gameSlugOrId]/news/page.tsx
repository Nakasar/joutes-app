import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getNews } from "@/lib/db/news.ts";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { ArrowLeft, ChevronLeft, ChevronRight, PenSquare } from "lucide-react";
import { auth } from "@/lib/auth.ts";
import { hasPermission } from "@/lib/db/permissions.ts";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar.tsx";
import {
  GameToolGridSkeleton,
  GameToolHeaderSkeleton,
} from "@/components/games/GameToolSkeletons.tsx";
import NewsCard from "./NewsCard.tsx";

const PAGE_SIZE = 9;

type GameParams = Promise<{ gameSlugOrId: string }>;

/**
 * Le jeu, à condition qu'il ouvre ses actualités.
 *
 * Le fanion se pose depuis l'administration, et un jeu qui ne l'a pas n'a pas
 * de page d'actualités : la refermer ici plutôt que de la rendre vide évite
 * qu'une adresse partagée survive à la fonctionnalité qu'on vient d'éteindre.
 */
async function requireGameWithNews(gameSlugOrId: string) {
  const game = await readGameBySlugOrId(gameSlugOrId);

  if (!game?.features?.news) {
    notFound();
  }

  return game;
}

interface GameNewsPageProps {
  params: GameParams;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: GameNewsPageProps): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.news");

  if (!game?.features?.news) {
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
      <Suspense fallback={<GameToolHeaderSkeleton />}>
        <NewsHeader params={params} />
      </Suspense>

      <Suspense fallback={<GameToolGridSkeleton />}>
        <NewsList params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewsHeader({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const game = await requireGameWithNews(gameSlugOrId);

  const t = await getTranslations("Games.news");

  return (
    <div className="flex flex-row flex-wrap justify-between gap-4">
      <div className="flex flex-row flex-wrap items-center gap-4">
        <Button asChild variant="outline">
          <Link href={`/games/${game.slug ?? gameSlugOrId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("back")}
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">{t("title", { gameName: game.name })}</h1>
      </div>
      <div className="flex flex-row flex-wrap items-center gap-4">
        <GameToolsNavBar gameSlug={game.slug ?? game.id} currentTab="news" />
        {/* Pas de silhouette : ce bouton ne s'affiche qu'à la rédaction, et lui
            réserver sa place la ferait sauter pour tous les autres. Sa frontière
            est ici plutôt qu'autour de l'en-tête : le droit se lit à la requête,
            le titre n'a pas à l'attendre. */}
        <Suspense fallback={null}>
          <WriteNewsButton gameId={game.id} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Le raccourci vers l'éditeur, le jeu déjà rattaché.
 *
 * Rédiger demande le droit `news:update` : sans lui, le bouton disparaît plutôt
 * que de mener à un formulaire dont l'envoi serait refusé.
 */
async function WriteNewsButton({ gameId }: { gameId: string }) {
  const canWrite = await hasPermission("news:update").catch(() => false);
  if (!canWrite) return null;

  const t = await getTranslations("Games.news");

  return (
    <Button asChild>
      <Link href={`/news/create?gameId=${gameId}`}>
        <PenSquare className="h-4 w-4 mr-2" />
        {t("create")}
      </Link>
    </Button>
  );
}

async function NewsList({ params, searchParams }: GameNewsPageProps) {
  const { gameSlugOrId } = await params;
  const game = await requireGameWithNews(gameSlugOrId);

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
