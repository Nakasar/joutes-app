import { ObjectId } from "mongodb";
import Link from "next/link";
import { getAllGames } from "@/lib/db/games";
import {
  countGameProducts,
  getGameProduct,
  getGameProductAttributeFields,
  getProductSummariesByIds,
  getRecentGameProducts,
} from "@/lib/db/products";
import ProductForm from "./ProductForm";
import ProductBrowser from "./ProductBrowser";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ gameId?: string; productId?: string }>;
}) {
  const { gameId, productId } = await searchParams;

  const games = (await getAllGames()).sort((a, b) => a.name.localeCompare(b.name));
  const selectedGame = games.find((game) => game.id === gameId);

  const [attributeFields, recentProducts, productCount, product] = selectedGame
    ? await Promise.all([
        getGameProductAttributeFields(new ObjectId(selectedGame.id)),
        getRecentGameProducts(new ObjectId(selectedGame.id)),
        countGameProducts(new ObjectId(selectedGame.id)),
        productId ? getGameProduct(new ObjectId(selectedGame.id), productId) : Promise.resolve(null),
      ])
    : [[], [], 0, null];

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
    <div className="bg-muted/50 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestion des produits</h1>
          <p className="text-muted-foreground">
            Les boîtes, figurines et accessoires des jeux qui ne se jouent pas avec des cartes. Une boîte déclare
            ce qu&apos;elle contient : les joueurs pourront l&apos;ajouter à leur collection d&apos;un geste, avec
            ses figurines.
          </p>
        </div>

        <div className="bg-card rounded-lg shadow-md p-6 space-y-3">
          <label className="block text-sm font-medium text-foreground">Jeu</label>
          <div className="flex flex-wrap gap-2">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/admin/products?gameId=${game.id}`}
                className={`px-3 py-1.5 rounded-lg border text-sm ${
                  game.id === selectedGame?.id
                    ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    : "border-input text-foreground hover:border-blue-500"
                }`}
              >
                {game.name}
              </Link>
            ))}
          </div>
          {games.length === 0 && <p className="text-sm text-muted-foreground">Aucun jeu enregistré.</p>}

          {selectedGame && (
            <div className="flex flex-wrap items-start justify-between gap-3 border-t pt-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{productCount}</span> produit
                {productCount === 1 ? "" : "s"} pour {selectedGame.name}.
              </p>
              {!selectedGame.features?.products && productCount > 0 && (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  La fonctionnalité « produits » n&apos;est pas activée pour ce jeu : le catalogue reste invisible
                  côté joueurs. Cochez-la dans{" "}
                  <Link href="/admin/games" className="underline">
                    la fiche du jeu
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
        </div>

        {selectedGame ? (
          <>
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
      </div>
    </div>
  );
}
