import {CardsComponent} from "@/app/[locale]/(app)/games/[gameSlugOrId]/cards/components.tsx";
import {Game} from "@/lib/types/Game.ts";
import {Metadata} from "next";
import db from "@/lib/mongodb.ts";
import {notFound} from "next/navigation";
import { getTranslations } from "next-intl/server";
import {Button} from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
