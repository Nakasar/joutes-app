import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getProductCollection } from "@/lib/db/products-collection";
import ProductsBrowser from "./ProductsBrowser";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameSlug: string }>;
}): Promise<Metadata> {
  const { gameSlug } = await params;
  const t = await getTranslations("Collection.products");
  const game = await getGameBySlugOrId(gameSlug);
  return {
    title: game ? t("metadataTitle", { game: game.name }) : t("title"),
  };
}

export default async function ProductCollectionPage({
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
  if (!game?.features?.products) {
    notFound();
  }

  const initial = await getProductCollection({
    owner: { type: "user", id: session.user.id },
    gameId: game.id,
    edition: game.currentProductEdition,
    page: 1,
    limit: 48,
  });

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <ProductsBrowser
        gameSlug={game.slug ?? game.id}
        gameName={game.name}
        initialData={initial}
        currentEdition={game.currentProductEdition}
      />
    </div>
  );
}
