import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getGameCollection } from "@/lib/db/collection.ts";
import { hasProducts } from "@/lib/db/products.ts";
import { ObjectId } from "mongodb";
import { collectionFormatsForGame } from "@/lib/collection/formats";
import GameCollectionBrowser from "./GameCollectionBrowser.tsx";


export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameSlug: string }>;
}): Promise<Metadata> {

  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer, et aucune frontière n'y change rien.
  await connection();
  const { gameSlug } = await params;
  const t = await getTranslations("Collection");
  const game = await readGameBySlugOrId(gameSlug);
  return {
    title: game ? t("gameMetadata.title", { game: game.name }) : t("metadata.title"),
  };
}

async function GameCollectionPageContent({
  params,
}: {
  params: Promise<{ gameSlug: string }>;
}) {

  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer, et aucune frontière n'y change rien.
  await connection();
  const { gameSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const game = await readGameBySlugOrId(gameSlug);
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

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function GameCollectionPage(props: Parameters<typeof GameCollectionPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <CollectionSkeleton tiles={12} label="Chargement de la collection" />
        </div>
      }
    >
      <GameCollectionPageContent {...props} />
    </Suspense>
  );
}
