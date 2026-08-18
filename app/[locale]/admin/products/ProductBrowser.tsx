"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { PRODUCT_KINDS } from "@/lib/constants/product-kinds";
import type { GameProductSummary } from "@/lib/db/products";
import { searchProducts } from "./actions";

type Props = {
  gameId: string;
  selectedProductId?: string;
  /** Derniers produits ajoutés, affichés tant qu'aucune recherche n'est saisie. */
  recentProducts: GameProductSummary[];
};

const MIN_QUERY_LENGTH = 2;

function ProductRow({
  product,
  gameId,
  selected,
}: {
  product: GameProductSummary;
  gameId: string;
  selected: boolean;
}) {
  const content = (
    <>
      {product.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image}
          alt=""
          loading="lazy"
          className="h-12 w-12 flex-shrink-0 rounded border object-cover"
        />
      ) : (
        <span className="h-12 w-12 flex-shrink-0 rounded border bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{product.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{product.id}</span>
          {product.setCode ? ` · ${product.setCode}` : ""}
          {` · ${PRODUCT_KINDS[product.kind]}`}
        </p>
        {product.contentsCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Contient {product.contentsCount} référence{product.contentsCount === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </>
  );

  if (selected) {
    return (
      <li className="flex items-center gap-3 rounded-lg border border-blue-500 bg-blue-500/5 p-2 text-sm">
        {content}
        <span className="flex-shrink-0 text-xs text-muted-foreground">En cours de modification</span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/admin/products?gameId=${gameId}&productId=${encodeURIComponent(product.id)}`}
        className="flex items-center gap-3 rounded-lg border border-transparent p-2 text-sm hover:border-input hover:bg-muted/50"
      >
        {content}
        <span className="flex-shrink-0 text-xs text-blue-600 dark:text-blue-400">Modifier</span>
      </Link>
    </li>
  );
}

/**
 * Choix du produit à modifier, sur le modèle du navigateur de cartes : tant que
 * rien n'est saisi, on propose les ajouts récents — reprendre le produit qu'on
 * vient de créer est le cas courant.
 */
export default function ProductBrowser({ gameId, selectedProductId, recentProducts }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameProductSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const sequence = useRef(0);

  const trimmed = query.trim();
  const isSearching = trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }

    const current = ++sequence.current;
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const products = await searchProducts(gameId, trimmed);
        if (current === sequence.current) {
          setResults(products);
        }
      } catch {
        if (current === sequence.current) {
          setResults([]);
        }
      } finally {
        if (current === sequence.current) {
          setSearching(false);
        }
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [gameId, trimmed]);

  const shown = isSearching ? results : recentProducts;

  return (
    <div className="bg-card rounded-lg shadow-md p-6 space-y-3">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="product-browser-search">
          Modifier un produit existant
        </label>
        <input
          id="product-browser-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Identifiant ou nom…"
          className="w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {isSearching
          ? searching
            ? "Recherche…"
            : `${results.length} résultat${results.length === 1 ? "" : "s"}`
          : "Derniers produits ajoutés"}
      </p>

      {isSearching && !searching && results.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun produit ne correspond.</p>
      )}
      {!isSearching && recentProducts.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun produit pour ce jeu pour l&apos;instant.</p>
      )}

      {shown.length > 0 && (
        <ul className="space-y-1">
          {shown.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              gameId={gameId}
              selected={product.id === selectedProductId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
