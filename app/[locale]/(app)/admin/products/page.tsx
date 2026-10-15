import { ObjectId } from "mongodb";
import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";
import { getAllGames } from "@/lib/db/games.ts";
import {
  countGameProducts,
  getGameProduct,
  getGameProductAttributeFields,
  getGameProductEditions,
  getProductSummariesByIds,
  getRecentGameProducts,
} from "@/lib/db/products.ts";
import EditionSettings from "./EditionSettings.tsx";
import ProductForm from "./ProductForm.tsx";
import ProductBrowser from "./ProductBrowser.tsx";
import { AdminPage } from "../_components/AdminPage.tsx";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ gameId?: string; productId?: string }>;
}) {
  const { gameId, productId } = await searchParams;

  const games = (await getAllGames()).sort((a, b) => a.name.localeCompare(b.name));
  const selectedGame = games.find((game) => game.id === gameId);

  const [attributeFields, recentProducts, productCount, editionCensus, product] = selectedGame
    ? await Promise.all([
        getGameProductAttributeFields(new ObjectId(selectedGame.id)),
        getRecentGameProducts(new ObjectId(selectedGame.id)),
        countGameProducts(new ObjectId(selectedGame.id)),
        getGameProductEditions(new ObjectId(selectedGame.id)),
        productId ? getGameProduct(new ObjectId(selectedGame.id), productId) : Promise.resolve(null),
      ])
    : [[], [], 0, { editions: [], untagged: 0 }, null];

  // Le contenu ne stocke que des références : sans les produits eux-mêmes,
  // l'éditeur n'afficherait que des identifiants.
  const contentProducts =
    selectedGame && product && product.contents.length > 0
      ? await getProductSummariesByIds(
          new ObjectId(selectedGame.id),
          product.contents.map((line) => line.productId)
        )
      : [];

  return (
    <AdminPage
      title="Gestion des produits"
      description={
        <p>
          Les boîtes, figurines et accessoires des jeux qui ne se jouent pas avec des cartes. Une boîte déclare
          ce qu&apos;elle contient : les joueurs pourront l&apos;ajouter à leur collection d&apos;un geste, avec
          ses figurines.
        </p>
      }
    >
      <nav aria-label="Jeu" className="flex flex-wrap items-center gap-1.5">
        {games.map((game) => (
          <Link
            key={game.id}
            href={`/admin/products?gameId=${game.id}`}
            aria-current={game.id === selectedGame?.id ? "page" : undefined}
            className={cn(
              "flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
              game.id === selectedGame?.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card hover:border-foreground/40"
            )}
          >
            {game.name}
          </Link>
        ))}
        {games.length === 0 && <p className="text-sm text-muted-foreground">Aucun jeu enregistré.</p>}
        {selectedGame && (
          <span className="ml-auto text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{productCount}</span> produit
            {productCount === 1 ? "" : "s"} pour {selectedGame.name}
          </span>
        )}
      </nav>

      {selectedGame && !selectedGame.features?.products && productCount > 0 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          La fonctionnalité « produits » n&apos;est pas activée pour ce jeu : le catalogue reste invisible
          côté joueurs. Cochez-la dans{" "}
          <Link href="/admin/games" className="underline">
            la fiche du jeu
          </Link>
          .
        </p>
      )}

      {selectedGame ? (
        <>
          <EditionSettings
            key={selectedGame.id}
            gameId={selectedGame.id}
            gameName={selectedGame.name}
            currentEdition={selectedGame.currentProductEdition}
            census={editionCensus}
          />
          <ProductBrowser
            gameId={selectedGame.id}
            selectedProductId={product?.id}
            recentProducts={recentProducts}
          />
          <ProductForm
            // Le formulaire garde son état localement : changer de jeu ou de
            // produit doit le remonter à neuf.
            key={`${selectedGame.id}:${product?.id ?? "new"}`}
            gameId={selectedGame.id}
            gameName={selectedGame.name}
            attributeFields={attributeFields}
            product={product ?? undefined}
            contentProducts={contentProducts}
          />
        </>
      ) : (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Choisissez un jeu pour gérer ses produits.
        </p>
      )}
    </AdminPage>
  );
}
