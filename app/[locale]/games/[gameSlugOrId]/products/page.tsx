import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getProductCollection } from "@/lib/db/products-collection";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar";
import ProductsExplorer from "./ProductsExplorer";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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

  // Le catalogue est lu par la même fonction avec ou sans compte : déconnecté,
  // il n'y a pas de propriétaire, et donc ni possession ni statistiques. Les
  // listes de filtres et les facettes du jeu, elles, arrivent dans les deux cas.
  const initial = await getProductCollection({
    owner: session?.user?.id ? { type: "user", id: session.user.id } : null,
    gameId: game.id,
    // Le premier rendu applique déjà l'édition en cours : sans cela, la grille
    // montrerait tout le catalogue sous une barre de filtres qui annonce la
    // dernière édition, le temps du premier chargement client.
    edition: game.currentProductEdition,
    page: 1,
    limit: 48,
  });

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4">
      <GameToolsNavBar gameSlug={gameSlug} currentTab="products" />
      <ProductsExplorer
        gameSlug={gameSlug}
        gameName={game.name}
        initialData={initial}
        currentEdition={game.currentProductEdition}
        signedIn={Boolean(session?.user?.id)}
      />
    </div>
  );
}
