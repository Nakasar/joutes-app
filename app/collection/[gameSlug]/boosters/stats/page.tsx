import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getBoosterStats } from "@/lib/db/booster-stats";
import BoosterStatsView from "./BoosterStatsView";

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
    title: game ? t("boosters.stats.metadataTitle", { game: game.name }) : t("boosters.stats.title"),
  };
}

export default async function BoosterStatsPage({
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

  const stats = await getBoosterStats({ userId: session.user.id, gameId: game.id });

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <BoosterStatsView gameSlug={game.slug ?? game.id} gameName={game.name} stats={stats} />
    </div>
  );
}
