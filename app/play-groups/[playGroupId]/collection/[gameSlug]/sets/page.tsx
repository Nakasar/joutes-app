import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { ObjectId } from "mongodb";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getGamesStats } from "@/lib/db/collection";
import SetsOverview from "@/app/collection/[gameSlug]/sets/SetsOverview";

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
    title: game ? t("sets.metadataTitle", { game: game.name }) : t("metadata.title"),
  };
}

export default async function PlayGroupGameSetsPage({
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
