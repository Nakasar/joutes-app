import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getGameCollection } from "@/lib/db/collection";
import GameCollectionBrowser from "@/app/collection/[gameSlug]/GameCollectionBrowser";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playGroupId: string; gameSlug: string }>;
}): Promise<Metadata> {
  const { gameSlug } = await params;
  const t = await getTranslations("Collection");
  const game = await getGameBySlugOrId(gameSlug);
  return {
    title: game ? t("gameMetadata.title", { game: game.name }) : t("metadata.title"),
  };
}

export default async function PlayGroupGameCollectionPage({
  params,
}: {
  params: Promise<{ playGroupId: string; gameSlug: string }>;
}) {
  const { playGroupId, gameSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    notFound();
  }

  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
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
        showBoosters={false}
        playGroupId={group.id}
      />
    </div>
  );
}
