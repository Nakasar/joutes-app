import { Suspense } from "react";
import { PlayGroupCollectionSkeleton } from "@/components/play-groups/PlayGroupSkeletons.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getPlayGroupByIdAndUser, isGameEnabledForPlayGroup } from "@/lib/db/play-groups.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getGameCollection } from "@/lib/db/collection.ts";
import GameCollectionBrowser from "@/app/[locale]/(app)/collection/[gameSlug]/GameCollectionBrowser.tsx";


export async function generateMetadata({
  params,
}: {
  params: Promise<{ playGroupId: string; gameSlug: string }>;
}): Promise<Metadata> {
  const { gameSlug } = await params;
  const t = await getTranslations("Collection");
  const game = await readGameBySlugOrId(gameSlug);
  return {
    title: game ? t("gameMetadata.title", { game: game.name }) : t("metadata.title"),
  };
}

async function PlayGroupGameCollectionPageContent({
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
  if (!game || !isGameEnabledForPlayGroup(group, game.id)) {
    notFound();
  }

  const initial = await getGameCollection({
    owner: { type: "playGroup", id: group.id },
    gameId: game.id,
    page: 1,
    limit: 48,
  });

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <GameCollectionBrowser
        gameSlug={game.slug ?? game.id}
        gameName={game.name}
        initialData={initial}
        basePath={`/play-groups/${group.id}/collection`}
        apiBasePath={`/api/play-groups/${group.id}/collection`}
        valuePath={`/api/play-groups/${group.id}/collection/games/${game.slug ?? game.id}/value`}
        showBoosters={false}
        playGroupId={group.id}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte : il faut être membre du groupe. La
 * coquille ne garde donc que le conteneur et la silhouette — le nom du groupe
 * lui-même n'a pas à s'afficher avant que la porte ait répondu.
 */
export default function PlayGroupGameCollectionPage(props: Parameters<typeof PlayGroupGameCollectionPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <PlayGroupCollectionSkeleton tiles={12} />
        </div>
      }
    >
      <PlayGroupGameCollectionPageContent {...props} />
    </Suspense>
  );
}
