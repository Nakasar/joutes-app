import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getGameCollection } from "@/lib/db/collection";
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

  const initial = await getGameCollection({
    userId: session.user.id,
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
      />
    </div>
  );
}
