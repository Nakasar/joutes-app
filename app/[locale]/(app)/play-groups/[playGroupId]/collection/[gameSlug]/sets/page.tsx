import { Suspense } from "react";
import { PlayGroupCollectionSkeleton } from "@/components/play-groups/PlayGroupSkeletons.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { ObjectId } from "mongodb";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getGamesStats } from "@/lib/db/collection.ts";
import SetsOverview from "@/app/[locale]/(app)/collection/[gameSlug]/sets/SetsOverview.tsx";


export async function generateMetadata({
  params,
}: {
  params: Promise<{ playGroupId: string; gameSlug: string }>;
}): Promise<Metadata> {
  const { gameSlug } = await params;
  const t = await getTranslations("Collection");
  const game = await readGameBySlugOrId(gameSlug);
  return {
    title: game ? t("sets.metadataTitle", { game: game.name }) : t("metadata.title"),
  };
}

async function PlayGroupGameSetsPageContent({
  params,
}: {
  params: Promise<{ playGroupId: string; gameSlug: string }>;
}) {
  const { playGroupId, gameSlug } = await params;

  // Le pilote Mongo touche à l'horloge en lisant le groupe, ce qu'un prérendu
  // ne sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    notFound();
  }

  const game = await readGameBySlugOrId(gameSlug);
  if (!game) {
    notFound();
  }

  const [stats] = await getGamesStats({ type: "playGroup", id: group.id }, [new ObjectId(game.id)]);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <SetsOverview
        gameSlug={game.slug ?? game.id}
        gameName={game.name}
        sets={stats?.sets ?? []}
        basePath={`/play-groups/${group.id}/collection`}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte : il faut être membre du groupe. La
 * coquille ne garde donc que le conteneur et la silhouette — le nom du groupe
 * lui-même n'a pas à s'afficher avant que la porte ait répondu.
 */
export default function PlayGroupGameSetsPage(props: Parameters<typeof PlayGroupGameSetsPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <PlayGroupCollectionSkeleton tiles={12} label="Chargement des extensions" />
        </div>
      }
    >
      <PlayGroupGameSetsPageContent {...props} />
    </Suspense>
  );
}
