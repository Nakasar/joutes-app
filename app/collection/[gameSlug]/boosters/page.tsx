import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { ObjectId } from "mongodb";
import db from "@/lib/mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getBoosters } from "@/lib/db/boosters";
import BoostersList from "./BoostersList";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameSlug: string }>;
}): Promise<Metadata> {
  const { gameSlug } = await params;
  const t = await getTranslations("Collection");
  const game = await getGameBySlugOrId(gameSlug);
  return { title: game ? t("boosters.metadataTitle", { game: game.name }) : t("boosters.title") };
}

export default async function BoostersPage({
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

  const [boosters, setCodesRaw, langsRaw] = await Promise.all([
    getBoosters({ userId: session.user.id, gameId: game.id, limit: 100 }),
    db.collection("cards").distinct("setCode", { gameId: new ObjectId(game.id) }),
    db.collection("cards").distinct("lang", { gameId: new ObjectId(game.id) }),
  ]);

  const setCodes = (setCodesRaw as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0).sort();
  const langs = (langsRaw as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0).sort();

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <BoostersList
        gameSlug={game.slug ?? game.id}
        gameName={game.name}
        initialBoosters={boosters}
        setCodes={setCodes}
        langs={langs}
      />
    </div>
  );
}
