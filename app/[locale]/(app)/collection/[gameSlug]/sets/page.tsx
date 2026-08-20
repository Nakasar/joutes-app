import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { ObjectId } from "mongodb";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getGamesStats } from "@/lib/db/collection.ts";
import SetsOverview from "./SetsOverview.tsx";


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
    title: game ? t("sets.metadataTitle", { game: game.name }) : t("metadata.title"),
  };
}

async function GameSetsPageContent({
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

  const [stats] = await getGamesStats({ type: "user", id: session.user.id }, [new ObjectId(game.id)]);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <SetsOverview
        gameSlug={game.slug ?? game.id}
        gameName={game.name}
        sets={stats?.sets ?? []}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function GameSetsPage(props: Parameters<typeof GameSetsPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <CollectionSkeleton tiles={12} label="Chargement des extensions" />
        </div>
      }
    >
      <GameSetsPageContent {...props} />
    </Suspense>
  );
}
