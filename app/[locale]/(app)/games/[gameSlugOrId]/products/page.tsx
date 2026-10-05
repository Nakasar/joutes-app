import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getProductCollection } from "@/lib/db/products-collection.ts";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar.tsx";
import {
  GameToolGridSkeleton,
  GameToolsNavBarSkeleton,
} from "@/components/games/GameToolSkeletons.tsx";
import ProductsExplorer from "./ProductsExplorer.tsx";
import { getGameProductFacets } from "@/lib/db/products.ts";
import { productCollectionQuery, readProductBrowseState } from "@/lib/products/browse-state.ts";
import { toURLSearchParams, type RawSearchParams } from "@/lib/navigation/url-query.ts";
import { ObjectId } from "mongodb";

type GameParams = Promise<{ gameSlugOrId: string }>;
type GameSearchParams = Promise<RawSearchParams>;

export async function generateMetadata({
  params,
}: {
  params: GameParams;
}): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const t = await getTranslations("Collection.products");
  const game = await readGameBySlugOrId(gameSlugOrId);
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
 *
 * Deux frontières : la barre d'outils ne dépend que du jeu, le catalogue dépend
 * en plus de la session — c'est elle qui décide des marques de possession.
 */
export default function GameProductsPage({
  params,
  searchParams,
}: {
  params: GameParams;
  searchParams: GameSearchParams;
}) {
  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4">
      <Suspense fallback={<GameToolsNavBarSkeleton />}>
        <ProductsNavBar params={params} />
      </Suspense>

      <Suspense fallback={<GameToolGridSkeleton cards={9} />}>
        <ProductsContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ProductsNavBar({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);

  if (!game?.features?.products) {
    notFound();
  }

  return <GameToolsNavBar gameSlug={game.slug ?? game.id} currentTab="products" />;
}

async function ProductsContent({ params, searchParams }: { params: GameParams; searchParams: GameSearchParams }) {
  const { gameSlugOrId } = await params;

  const game = await readGameBySlugOrId(gameSlugOrId);
  if (!game?.features?.products) {
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });

  // La recherche est relue de l'adresse : revenir en arrière, ou ouvrir un lien
  // partagé, rend la grille qu'on avait sous les yeux. Sans paramètre, c'est
  // l'édition en cours qui s'applique dès le premier rendu — la barre de
  // filtres ne doit pas annoncer autre chose que ce que la grille montre.
  const facets = await getGameProductFacets(new ObjectId(game.id));
  const initialState = readProductBrowseState(toURLSearchParams(await searchParams), {
    currentEdition: game.currentProductEdition,
    facets,
  });

  // Le catalogue est lu par la même fonction avec ou sans compte : déconnecté,
  // il n'y a pas de propriétaire, et donc ni possession ni statistiques. Les
  // listes de filtres et les facettes du jeu, elles, arrivent dans les deux cas.
  const initial = await getProductCollection({
    owner: session?.user?.id ? { type: "user", id: session.user.id } : null,
    gameId: game.id,
    ...productCollectionQuery(initialState),
    facets,
    limit: 48,
  });

  return (
    <ProductsExplorer
      gameSlug={game.slug ?? game.id}
      gameName={game.name}
      initialData={initial}
      initialState={initialState}
      currentEdition={game.currentProductEdition}
      signedIn={Boolean(session?.user?.id)}
    />
  );
}
