import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getBooster } from "@/lib/db/boosters";
import BoosterEditor from "./BoosterEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameSlug: string; boosterId: string }>;
}): Promise<Metadata> {
  const { gameSlug } = await params;
  const t = await getTranslations("Collection");
  const game = await getGameBySlugOrId(gameSlug);
  return { title: game ? t("boosters.metadataTitle", { game: game.name }) : t("boosters.title") };
}

export default async function BoosterEditorPage({
  params,
}: {
  params: Promise<{ gameSlug: string; boosterId: string }>;
}) {
  const { gameSlug, boosterId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    notFound();
  }

  const booster = await getBooster(boosterId);
  if (!booster || booster.userId !== session.user.id || booster.gameId !== game.id) {
    notFound();
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <BoosterEditor gameSlug={game.slug ?? game.id} gameName={game.name} initialBooster={booster} />
    </div>
  );
}
