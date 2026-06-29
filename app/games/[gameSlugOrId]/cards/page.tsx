import {CardsComponent} from "@/app/games/[gameSlugOrId]/cards/components";
import {Game} from "@/lib/types/Game";
import {Metadata} from "next";
import db from "@/lib/mongodb";
import {notFound} from "next/navigation";
import { getTranslations } from "next-intl/server";
import {Button} from "@/components/ui/button";
import Link from "next/link";
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar";

export async function generateMetadata({
                                         params
                                       }: {
  params: Promise<{ gameSlugOrId: string }>
}): Promise<Metadata> {
  const {gameSlugOrId} = await params;
  const game = await db.collection<Game>("games").findOne({slug: gameSlugOrId});
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

export default async function CardsPage({ params }: { params: Promise<{ gameSlugOrId: string }> }) {
  const {gameSlugOrId} = await params;
  const t = await getTranslations("Games");

  const game = await db.collection<Game>("games").findOne({slug: gameSlugOrId});
  if (!game || !game.slug) notFound();

  return (
    <div className="container mx-auto p-6">
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

      <CardsComponent gameSlug={game.slug} />
    </div>
  );
}
