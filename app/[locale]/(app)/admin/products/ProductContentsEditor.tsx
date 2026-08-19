"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Minus, Plus, Search, X } from "lucide-react";
import { PRODUCT_KINDS } from "@/lib/constants/product-kinds.ts";
import type { GameProductSummary } from "@/lib/db/products.ts";
import type { ProductContent } from "@/lib/types/product.ts";
import { searchProducts } from "./actions.ts";

const inputClass =
  "w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent";

/**
 * Contenu d'un produit : les références qui le composent et leur quantité.
 *
 * La recherche ne propose que des produits **sans contenu** : un contenant ne
 * peut pas en contenir un autre. Plutôt que de laisser saisir puis refuser à
 * l'enregistrement, on ne montre jamais ce qui ne peut pas être choisi.
 */
export default function ProductContentsEditor({
  gameId,
  currentProductId,
  contents,
  onChange,
  maxLines,
  knownProducts = [],
}: {
  gameId: string;
  /** Produit en cours d'édition, exclu des résultats : il ne peut pas se contenir. */
  currentProductId?: string;
  contents: ProductContent[];
  onChange: (contents: ProductContent[]) => void;
  maxLines: number;
  /**
   * Produits déjà connus du contenu, chargés par la page. Sans eux, l'édition
   * d'un produit existant n'afficherait que des identifiants : le contenu vient
   * de la base, qui ne stocke que des références.
   */
  knownProducts?: GameProductSummary[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameProductSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [names, setNames] = useState<Record<string, GameProductSummary>>(() =>
    Object.fromEntries(knownProducts.map((product) => [product.id, product]))
  );

  // Les réponses reviennent dans le désordre : seule la dernière recherche
  // lancée a le droit d'écrire dans les résultats.
  const sequence = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const current = ++sequence.current;
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const found = await searchProducts(gameId, trimmed, { leavesOnly: true });
        if (current === sequence.current) {
          setResults(found.filter((product) => product.id !== currentProductId));
        }
      } finally {
        if (current === sequence.current) {
          setSearching(false);
        }
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [gameId, query, currentProductId]);

  const atMax = contents.length >= maxLines;

  const addProduct = (product: GameProductSummary) => {
    setNames((prev) => ({ ...prev, [product.id]: product }));
    const existing = contents.find((line) => line.productId === product.id);
    if (existing) {
      // Ajouter deux fois la même référence en augmente la quantité : c'est ce
      // que veut dire un second clic.
      onChange(
        contents.map((line) =>
          line.productId === product.id ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line
        )
      );
    } else {
      if (atMax) return;
      onChange([...contents, { productId: product.id, quantity: 1 }]);
    }
    setQuery("");
    setResults([]);
  };

  const setQuantity = (productId: string, quantity: number) => {
    onChange(
      contents.map((line) =>
        line.productId === productId ? { ...line, quantity: Math.min(99, Math.max(1, quantity)) } : line
      )
    );
  };

  const removeLine = (productId: string) => {
    onChange(contents.filter((line) => line.productId !== productId));
  };

  const totalUnits = contents.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="space-y-3 rounded-lg border border-input p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">Contenu</p>
          <p className="text-xs text-muted-foreground">
            Les figurines et accessoires que ce produit contient. Laissez vide pour une figurine seule.
          </p>
        </div>
        {contents.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {contents.length} référence{contents.length === 1 ? "" : "s"} · {totalUnits} unité
            {totalUnits === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {contents.length > 0 && (
        <ul className="space-y-2">
          {contents.map((line) => {
            const product = names[line.productId];
            return (
              <li key={line.productId} className="flex items-center gap-2 rounded-lg border border-input p-2">
                {product?.image ? (
                  <Image
                    src={product.image}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                    className="size-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="size-10 shrink-0 rounded bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{product?.name ?? line.productId}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{line.productId}</span>
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQuantity(line.productId, line.quantity - 1)}
                    disabled={line.quantity <= 1}
                    aria-label={`Retirer une unité de ${product?.name ?? line.productId}`}
                    className="flex size-7 items-center justify-center rounded border border-input text-foreground disabled:opacity-40"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm tabular-nums">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(line.productId, line.quantity + 1)}
                    aria-label={`Ajouter une unité de ${product?.name ?? line.productId}`}
                    className="flex size-7 items-center justify-center rounded border border-input text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(line.productId)}
                  aria-label={`Retirer ${product?.name ?? line.productId} du contenu`}
                  className="flex size-7 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher une figurine à ajouter…"
          className={`${inputClass} pl-9`}
        />
      </div>

      {atMax && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Un produit ne peut pas contenir plus de {maxLines} références.
        </p>
      )}

      {searching && <p className="text-xs text-muted-foreground">Recherche…</p>}

      {results.length > 0 && (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => addProduct(product)}
                className="flex w-full items-center gap-2 rounded-lg border border-input p-2 text-left hover:border-blue-500"
              >
                {product.image ? (
                  <Image
                    src={product.image}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                    className="size-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="size-10 shrink-0 rounded bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{product.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {PRODUCT_KINDS[product.kind]}
                    {product.setCode ? ` · ${product.setCode}` : ""}
                  </span>
                </span>
                <Plus className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Aucune figurine trouvée. Seuls les produits sans contenu peuvent en composer un autre.
        </p>
      )}
    </div>
  );
}
