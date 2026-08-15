"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Library, Loader2, PackageX, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardSearchInput } from "@/components/cards/CardSearchInput";
import {
  EMPTY_PRODUCT_FILTERS,
  ProductFilterChips,
  ProductFilters,
  type ProductFilterState,
} from "@/components/products/ProductFilters";
import { ALL_EDITIONS } from "@/lib/constants/product-editions";
import { countActiveFacetFilters, serializeCardSearchCriteria } from "@/lib/cards/search-filters";
import { buildProductSearchFields } from "@/lib/products/search";
import type { ProductCollectionItem, ProductCollectionResult } from "@/lib/db/products-collection";
import ProductTile from "@/components/products/ProductTile";
import ProductManager from "@/components/products/ProductManager";

/**
 * Catalogue d'un jeu. Le même écran sert connecté et déconnecté : sans session,
 * il n'y a simplement rien à marquer comme possédé, et la grille invite à se
 * connecter plutôt que de mentir avec des tuiles grises.
 */
export default function ProductsExplorer({
  gameSlug,
  gameName,
  initialData,
  currentEdition,
  signedIn,
}: {
  gameSlug: string;
  gameName: string;
  initialData: ProductCollectionResult;
  /** Édition en cours du jeu : ce que l'API montre déjà par défaut. */
  currentEdition?: string;
  signedIn: boolean;
}) {
  const t = useTranslations("Collection.products");

  const [items, setItems] = useState<ProductCollectionItem[]>(initialData.items);
  const [setCodes] = useState(initialData.setCodes);
  const [editions] = useState(initialData.editions);
  const [facets] = useState(initialData.facets);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const [totalPages, setTotalPages] = useState(initialData.totalPages);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ProductFilterState>({
    ...EMPTY_PRODUCT_FILTERS,
    // Le filtre part de l'édition en cours parce que c'est ce que la route rend
    // déjà : afficher « toutes les éditions » au-dessus d'une grille filtrée
    // ferait mentir la barre de filtres dès le premier rendu.
    edition: currentEdition ?? ALL_EDITIONS,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [managed, setManaged] = useState<ProductCollectionItem | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);
  const dirtyRef = useRef(false);

  const searchFields = useMemo(
    () => buildProductSearchFields(facets, { setCodes }),
    [facets, setCodes]
  );

  const fetchPage = useCallback(
    async (next: { search: string; filters: ProductFilterState; page: number }) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setLoading(true);
      setLoadError(false);
      try {
        const params = new URLSearchParams({ page: String(next.page), limit: "48" });
        if (next.search.trim()) params.set("search", next.search.trim());
        if (next.filters.setCode !== "all") params.set("setCode", next.filters.setCode);
        if (next.filters.kind !== "all") params.set("kind", next.filters.kind);
        // Toujours transmis : sans le paramètre, la route appliquerait son
        // propre défaut, et « toutes les éditions » ne lèverait rien.
        params.set("edition", next.filters.edition);
        if (next.filters.shape !== "all") params.set("containers", String(next.filters.shape === "containers"));
        for (const [key, value] of serializeCardSearchCriteria(next.filters.criteria)) {
          params.set(key, value);
        }

        // Connecté, la route de collection rend le même catalogue annoté de la
        // possession ; sinon, la route publique le rend nu.
        const url = signedIn
          ? `/api/collection/games/${encodeURIComponent(gameSlug)}/products?${params}`
          : `/api/games/${encodeURIComponent(gameSlug)}/products?${params}`;

        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("failed");
        const data: ProductCollectionResult = await response.json();

        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setLoadError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [gameSlug, signedIn]
  );

  // Le rendu serveur fournit déjà la première page, connecté comme non : ne pas
  // la redemander au montage.
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }

    const timeout = setTimeout(() => {
      void fetchPage({ search, filters, page: 1 });
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, filters, fetchPage]);

  const changeFilters = (next: Partial<ProductFilterState>) =>
    setFilters((current) => ({ ...current, ...next }));

  const resetAll = () => {
    setSearch("");
    setFilters({ ...EMPTY_PRODUCT_FILTERS, edition: currentEdition ?? ALL_EDITIONS });
  };

  const closeManager = () => {
    setManaged(null);
    if (dirtyRef.current) {
      dirtyRef.current = false;
      void fetchPage({ search, filters, page });
    }
  };

  const activeFilterCount = countActiveFacetFilters(filters.criteria);
  const narrowed =
    search.trim().length > 0 ||
    filters.setCode !== "all" ||
    filters.kind !== "all" ||
    filters.shape !== "all" ||
    activeFilterCount > 0;
  const resettable = narrowed || filters.edition !== (currentEdition ?? ALL_EDITIONS);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">{t("explorerTitle", { game: gameName })}</h1>
          <p className="text-muted-foreground">{t("explorerSubtitle")}</p>
        </div>
        {signedIn && (
          <Button variant="outline" asChild>
            <Link href={`/collection/${gameSlug}/products`}>
              <Library className="size-4" />
              {t("goToCollection")}
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className={`${filtersOpen ? "block" : "hidden"} lg:block lg:w-72 lg:shrink-0`}>
          <ProductFilters
            state={filters}
            onChange={changeFilters}
            setCodes={setCodes}
            editions={editions}
            facets={facets}
            resettable={resettable}
            onReset={resetAll}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[240px] flex-1 items-center">
              <CardSearchInput
                value={search}
                onChange={setSearch}
                fields={searchFields}
                placeholder={t("filters.searchPlaceholder")}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setFiltersOpen((open) => !open)}
              className="h-10 lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t("filters.title")}
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">{activeFilterCount}</span>
              ) : null}
            </Button>
          </div>

          <ProductFilterChips
            search={search}
            onSearchChange={setSearch}
            fields={searchFields}
            state={filters}
            onChange={changeFilters}
            editions={editions}
          />

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t("filters.results", { count: total })}</span>
            {loading && <Loader2 className="size-4 animate-spin" />}
          </div>

          {!signedIn && items.length > 0 && (
            <p className="rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
              {t("signedOutHint")}{" "}
              <Link href="/login" className="text-primary hover:underline">
                {t("signIn")}
              </Link>
            </p>
          )}

          {loadError ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
              <SlidersHorizontal className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("empty.loadError")}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchPage({ search, filters, page })}>
                {t("filters.retry")}
              </Button>
            </div>
          ) : items.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
              <PackageX className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {narrowed
                  ? t("empty.noResults")
                  : filters.edition !== ALL_EDITIONS
                    ? t("empty.noEdition")
                    : t("empty.noCatalog", { game: gameName })}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {items.map((item) => (
                <ProductTile
                  key={item.id}
                  product={item}
                  kindLabel={t(`kinds.${item.kind}`)}
                  editionLabel={
                    item.edition && item.edition !== currentEdition
                      ? t("tile.edition", { edition: item.edition })
                      : undefined
                  }
                  onManage={() => (signedIn ? setManaged(item) : undefined)}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => void fetchPage({ search, filters, page: page - 1 })}
              >
                {t("filters.previous")}
              </Button>
              <span className="text-muted-foreground tabular-nums">
                {t("filters.pageOf", { page, totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => void fetchPage({ search, filters, page: page + 1 })}
              >
                {t("filters.next")}
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={managed !== null} onOpenChange={(open) => !open && closeManager()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {managed && (
            <>
              <DialogHeader>
                <DialogTitle>{managed.name}</DialogTitle>
              </DialogHeader>
              <ProductManager
                gameSlug={gameSlug}
                productId={managed.id}
                onChanged={() => {
                  dirtyRef.current = true;
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
