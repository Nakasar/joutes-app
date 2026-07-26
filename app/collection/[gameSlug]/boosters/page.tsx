import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { ObjectId } from "mongodb";
import db from "@/lib/mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { countBoosters, getBoosterTypesInUse, getBoosters, type BoosterSort } from "@/lib/db/boosters";
import { isBoosterType, normalizeBoosterType } from "@/lib/constants/booster-types";
import BoostersList from "./BoostersList";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

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
  searchParams,
}: {
  params: Promise<{ gameSlug: string }>;
  searchParams: Promise<{ page?: string; type?: string; sort?: string }>;
}) {
  const { gameSlug } = await params;
  const { page: pageParam, type: typeParam, sort: sortParam } = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    notFound();
  }

  const sort: BoosterSort = sortParam === "oldest" ? "oldest" : "newest";
  // Un type inconnu du jeu (URL bricolée, type retiré depuis) est ignoré plutôt
  // que d'afficher une liste vide sans raison visible.
  const normalizedType = typeParam ? normalizeBoosterType(typeParam) : undefined;
  const type = normalizedType && isBoosterType(game.slug, normalizedType) ? normalizedType : undefined;
  const requestedPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const filters = { userId: session.user.id, gameId: game.id, type };
  const total = await countBoosters(filters);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const [boosters, typesInUse, setCodesRaw, langsRaw] = await Promise.all([
    getBoosters({ ...filters, page: page - 1, limit: PAGE_SIZE, sort }),
    getBoosterTypesInUse({ userId: session.user.id, gameId: game.id }),
    db.collection("cards").distinct("setCode", { gameId: new ObjectId(game.id) }),
    db.collection("cards").distinct("lang", { gameId: new ObjectId(game.id) }),
  ]);

  const setCodes = (setCodesRaw as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0).sort();
  let langs = (langsRaw as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0).sort();
  if (langs.length === 0) {
    langs = ['fr', 'en'];
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <BoostersList
        gameSlug={game.slug ?? game.id}
        gameName={game.name}
        initialBoosters={boosters}
        setCodes={setCodes}
        langs={langs}
        typesInUse={typesInUse}
        typeFilter={type}
        sort={sort}
        page={page}
        totalPages={totalPages}
        total={total}
      />
    </div>
  );
}
