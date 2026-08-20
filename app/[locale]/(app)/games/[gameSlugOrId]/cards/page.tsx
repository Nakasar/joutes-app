import {CardsComponent} from "@/app/[locale]/(app)/games/[gameSlugOrId]/cards/components.tsx";
import {Metadata} from "next";
import {readGameBySlugOrId} from "@/lib/db/games-cached.ts";
import {notFound} from "next/navigation";
import {Suspense} from "react";
import { getTranslations } from "next-intl/server";
import {Button} from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar.tsx";
import {
  GameToolGridSkeleton,
  GameToolHeaderSkeleton,
} from "@/components/games/GameToolSkeletons.tsx";

type GameParams = Promise<{ gameSlugOrId: string }>;

export async function generateMetadata({
                                         params
                                       }: {
  params: GameParams
}): Promise<Metadata> {
  const {gameSlugOrId} = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games");

  if (!game) {
    return {
      title: t("cards.metadata.notFoundTitle"),
    };
  }

  return {
    title: t("cards.metadata.title", { gameName: game.name }),
    description: t("cards.metadata.description", { gameName: game.name }),
    openGraph: {
      title: t("cards.metadata.title", { gameName: game.name }),
      description: t("cards.metadata.description", { gameName: game.name }),
      images: game.banner ? [game.banner] : [],
    },
  };
}

/**
 * Deux frontières : l'en-tête ne dépend que du jeu, la galerie a sa propre
 * mécanique de recherche et n'a pas besoin d'attendre le titre.
 */
export default function CardsPage({ params }: { params: GameParams }) {
  return (
    <div className="container mx-auto p-6">
      <Suspense fallback={<GameToolHeaderSkeleton />}>
        <CardsHeader params={params} />
      </Suspense>

      <Suspense fallback={<GameToolGridSkeleton cards={9} />}>
        <CardsGallery params={params} />
      </Suspense>
    </div>
  );
}

async function CardsHeader({ params }: { params: GameParams }) {
  const {gameSlugOrId} = await params;
  const t = await getTranslations("Games");

  return (
    <div className="flex flex-row flex-wrap justify-between">
      <div className="flex flex-row flex-wrap gap-4">
        <Button asChild>
          <Link href={`/games/${gameSlugOrId}`} className="text-blue-600 hover:underline">
            ← <span className="hidden lg:inline">{t("cards.back")}</span>
          </Link>
        </Button>
        <h1 className="text-3xl font-bold mb-6">{t("cards.search.title")}</h1>
      </div>
      <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={'cards'} />
    </div>
  );
}

async function CardsGallery({ params }: { params: GameParams }) {
  const {gameSlugOrId} = await params;

  const game = await readGameBySlugOrId(gameSlugOrId);
  if (!game || !game.slug) notFound();

  return <CardsComponent gameSlug={game.slug} />;
}
