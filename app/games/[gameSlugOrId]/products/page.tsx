import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { ObjectId } from "mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getGameProductSetCodes } from "@/lib/db/products";
import { getProductCollection } from "@/lib/db/products-collection";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar";
import ProductsExplorer from "./ProductsExplorer";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameSlugOrId: string }>;
}): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const t = await getTranslations("Collection.products");
  const game = await getGameBySlugOrId(gameSlugOrId);
  return {
    title: game ? t("metadataTitle", { game: game.name }) : t("title"),
  };
}

/**
 * Exploration du catalogue de produits d'un jeu — consultable sans compte.
 *
 * Connecté, la page est celle de la collection : chaque produit porte ce qu'on
 * en possède. Déconnecté, c'est le même catalogue sans marques de possession,
 * comme la galerie de cartes.
 */
export default async function GameProductsPage({
  params,
}: {
  params: Promise<{ gameSlugOrId: string }>;
}) {
  const { gameSlugOrId } = await params;

  const game = await getGameBySlugOrId(gameSlugOrId);
  if (!game?.features?.products) {
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const gameSlug = game.slug ?? game.id;

  const initial = session?.user?.id
    ? await getProductCollection({
        owner: { type: "user", id: session.user.id },
        gameId: game.id,
        page: 1,
        limit: 48,
      })
    : null;

  const setCodes = initial?.setCodes ?? (await getGameProductSetCodes(new ObjectId(game.id)));

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4">
      <GameToolsNavBar gameSlug={gameSlug} currentTab="products" />
      <ProductsExplorer
        gameSlug={gameSlug}
        gameName={game.name}
        initialData={initial}
        setCodes={setCodes}
        signedIn={Boolean(session?.user?.id)}
      />
    </div>
  );
}
