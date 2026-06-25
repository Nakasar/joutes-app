import {CardsComponent} from "@/app/games/[gameSlugOrId]/cards/components";
import {Game} from "@/lib/types/Game";
import {Metadata} from "next";
import db from "@/lib/mongodb";
import {notFound} from "next/navigation";
import { getTranslations } from "next-intl/server";

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

  const game = await db.collection<Game>("games").findOne({slug: gameSlugOrId});
  if (!game || !game.slug) notFound();

  return <CardsComponent gameSlug={game.slug} />;
}
