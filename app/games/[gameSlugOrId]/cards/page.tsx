import {CardsComponent} from "@/app/games/[gameSlugOrId]/cards/components";
import {Game} from "@/lib/types/Game";
import {Metadata} from "next";
import db from "@/lib/mongodb";
import {notFound} from "next/navigation";

export async function generateMetadata({
                                         params
                                       }: {
  params: Promise<{ gameSlugOrId: string }>
}): Promise<Metadata> {
  const {gameSlugOrId} = await params;
  const game = await db.collection<Game>("games").findOne({slug: gameSlugOrId});

  if (!game) {
    return {
      title: 'Jeu non trouvé',
    };
  }

  return {
    title: `${game.name} - Galerie de cartes, erratas et rulings`,
    description: `Explore cards and their erratas and rulings for ${game.name}.`,
    openGraph: {
      title: `${game.name} - Galerie de cartes, erratas et rulings`,
      description: `Explore cards and their erratas and rulings for ${game.name}.`,
      images: game.banner ? [game.banner] : [],
    },
  };
}

export default async function CardsPage({ params }: { params: Promise<{ gameSlugOrId: string }> }) {
  const {gameSlugOrId} = await params;

  const game = await db.collection<Game>("games").findOne({slug: gameSlugOrId});
  if (!game || !game.slug) notFound();

  return <CardsComponent />;
}
