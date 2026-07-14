import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { ObjectId } from "mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getGamesStats } from "@/lib/db/collection";
import SetsOverview from "./SetsOverview";

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
    title: game ? t("sets.metadataTitle", { game: game.name }) : t("metadata.title"),
  };
}

export default async function GameSetsPage({
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
