import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getGameCollection } from "@/lib/db/collection";
import { hasProducts } from "@/lib/db/products";
import { ObjectId } from "mongodb";
import { collectionFormatsForGame } from "@/lib/collection/formats";
import GameCollectionBrowser from "./GameCollectionBrowser";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameSlug: string }>;
}): Promise<Metadata> {
  const { gameSlug } = await params;
  const t = await getTranslations("Collection");
  const game = await getGameBySlugOrId(gameSlug);
  return {
    title: game ? t("gameMetadata.title", { game: game.name }) : t("metadata.title"),
  };
}

export default async function GameCollectionPage({
  params,
}: {
  params: Promise<{ gameSlug: string }>;
}) {
  const { gameSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    notFound();
  }

  const [initial, gameHasProducts] = await Promise.all([
    getGameCollection({
      owner: { type: "user", id: session.user.id },
      gameId: game.id,
      page: 1,
      limit: 48,
    }),
    game.features?.products ? hasProducts(new ObjectId(game.id)) : Promise.resolve(false),
  ]);

  // Un jeu de figurines n'a pas de cartes : cet écran n'aurait rien à montrer.
  // On envoie directement là où sa collection se trouve.
  if (gameHasProducts && initial.total === 0) {
    redirect(`/collection/${game.slug ?? game.id}/products`);
  }

  const gameSlugOrId = game.slug ?? game.id;

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <GameCollectionBrowser
        gameSlug={gameSlugOrId}
        gameName={game.name}
        initialData={initial}
        hasProducts={gameHasProducts}
        valuePath={`/api/collection/games/${gameSlugOrId}/value`}
        transferFormats={collectionFormatsForGame(gameSlugOrId).map((format) => ({
          id: format.id,
          label: format.label,
        }))}
      />
    </div>
  );
}
