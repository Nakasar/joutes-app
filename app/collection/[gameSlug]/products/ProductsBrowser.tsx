"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Boxes, Brush, Loader2, Package, PackageX, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompletionBar } from "@/app/collection/CollectionOverview";
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

export default function ProductsBrowser({
  gameSlug,
  gameName,
  initialData,
  currentEdition,
  basePath = "/collection",
  apiBasePath = "/api/collection",
}: {
  gameSlug: string;
  gameName: string;
  initialData: ProductCollectionResult;
  /** Édition en cours du jeu : ce que la route rend déjà par défaut. */
  currentEdition?: string;
  basePath?: string;
  apiBasePath?: string;
}) {
  const t = useTranslations("Collection.products");

  const [items, setItems] = useState<ProductCollectionItem[]>(initialData.items);
  const [stats, setStats] = useState(initialData.stats);
  const [setCodes] = useState(initialData.setCodes);
  const [editions] = useState(initialData.editions);
  const [facets] = useState(initialData.facets);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const [totalPages, setTotalPages] = useState(initialData.totalPages);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ProductFilterState>({
    ...EMPTY_PRODUCT_FILTERS,
    // Aligné sur ce que la route a déjà appliqué au premier rendu.
    edition: currentEdition ?? ALL_EDITIONS,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [managed, setManaged] = useState<ProductCollectionItem | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);

  // Le vocabulaire de la saisie vient du catalogue du jeu, comme les filtres :
  // `faction:Rebelles`, `points<=8`, `set:LEG`… Rien n'est codé par jeu.
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
        const params = new URLSearchParams({ page: String(next.page), limit: String(initialData.limit) });
        if (next.search.trim()) params.set("search", next.search.trim());
        if (next.filters.setCode !== "all") params.set("setCode", next.filters.setCode);
        // Toujours transmis : sans le paramètre, la route appliquerait son
        // propre défaut, et « toutes les éditions » ne lèverait rien.
        params.set("edition", next.filters.edition);
        if (next.filters.kind !== "all") params.set("kind", next.filters.kind);
        if (next.filters.ownership !== "all") params.set("owned", String(next.filters.ownership === "owned"));
        if (next.filters.shape !== "all") params.set("containers", String(next.filters.shape === "containers"));
        for (const [key, value] of serializeCardSearchCriteria(next.filters.criteria)) {
          params.set(key, value);
        }

        const response = await fetch(
          `${apiBasePath}/games/${encodeURIComponent(gameSlug)}/products?${params}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("failed");
        const data: ProductCollectionResult = await response.json();

        setItems(data.items);
        setStats(data.stats);
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
    [apiBasePath, gameSlug, initialData.limit]
  );

  // Le rendu serveur fournit déjà la première page : ne pas la redemander au
  // montage.
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

  /** Remet tout à zéro d'un geste — saisie comprise, comme la recherche de cartes. */
  const resetAll = () => {
    setSearch("");
    setFilters({ ...EMPTY_PRODUCT_FILTERS, edition: currentEdition ?? ALL_EDITIONS });
  };

  /**
   * Mise à jour immédiate de la tuile ouverte, pour que le dialogue et la
   * grille ne se contredisent pas.
   *
   * La page entière est rechargée à la fermeture, et non ici : ajouter une
   * figurine change aussi la complétude des boîtes qui la contiennent, y
   * compris hors de l'écran. Une seule requête à la fin plutôt qu'une à chaque
   * clic dans le dialogue.
   */
  const dirtyRef = useRef(false);
  const refreshQuantity = (productId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== productId || item.quantity === quantity) return item;
        dirtyRef.current = true;
        return { ...item, quantity };
      })
    );
  };

  const closeManager = () => {
    setManaged(null);
    if (dirtyRef.current) {
      dirtyRef.current = false;
      void fetchPage({ search, filters, page });
    }
  };

  const activeSet =
    filters.setCode !== "all" ? stats?.sets.find((row) => row.setCode === filters.setCode) : undefined;
  const productsOwned = activeSet?.productsOwned ?? stats?.productsOwned ?? 0;
  const productsTotal = activeSet?.productsTotal ?? stats?.productsTotal ?? 0;
  const unitsOwned = activeSet?.unitsOwned ?? stats?.unitsOwned ?? 0;
  const unitsTotal = activeSet?.unitsTotal ?? stats?.unitsTotal ?? 0;

  // L'édition annoncée est celle que les nombres couvrent vraiment ; sans
  // statistiques — un catalogue vide pour cette édition —, celle qui est
  // demandée, faute de mieux.
  const statsEdition =
    stats?.edition ?? (filters.edition !== ALL_EDITIONS ? filters.edition : undefined);

  const activeFilterCount = countActiveFacetFilters(filters.criteria);
  // L'édition est mise à part : elle est toujours posée, et une grille vide
  // s'explique autrement selon qu'elle est seule en cause ou non.
  const narrowed =
    search.trim().length > 0 ||
    filters.setCode !== "all" ||
    filters.kind !== "all" ||
    filters.ownership !== "all" ||
    filters.shape !== "all" ||
    activeFilterCount > 0;
  const resettable = narrowed || filters.edition !== (currentEdition ?? ALL_EDITIONS);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`${basePath}/${gameSlug}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("backToCollection", { game: gameName })}
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle", { game: gameName })}</p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Sur bureau les filtres vivent dans une colonne à demeure, comme la
            recherche de cartes : ils restent lisibles pendant qu'on parcourt le
            catalogue. Sur mobile, la colonne se déplie. */}
        <aside className={`${filtersOpen ? "block" : "hidden"} lg:block lg:w-72 lg:shrink-0`}>
          <ProductFilters
            state={filters}
            onChange={changeFilters}
            setCodes={setCodes}
            editions={editions}
            facets={facets}
            showOwnership
            // L'édition se choisit au-dessus des statistiques : c'est elle qui
            // décide de ce qu'elles comptent, la ranger ici la couperait de ses
            // barres de complétion.
            showEdition={false}
            resettable={resettable}
            onReset={resetAll}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {(stats || editions.length > 0) && (
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
              {/* Le sélecteur est rendu même sans statistiques : une édition en
                  cours dont le catalogue est vide n'en donne aucune, et sans lui
                  rien ne permettrait plus d'aller voir les autres éditions. */}
              {editions.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{t("stats.title")}</span>
                    <span className="text-xs text-muted-foreground">
                      {statsEdition ? t("stats.scopedTo", { edition: statsEdition }) : t("stats.allEditions")}
                    </span>
                  </div>
                  <Select value={filters.edition} onValueChange={(edition) => changeFilters({ edition })}>
                    <SelectTrigger className="w-auto min-w-[12rem]" aria-label={t("filters.edition")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_EDITIONS}>{t("filters.allEditions")}</SelectItem>
                      {editions.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {stats && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <CompletionBar
                    label={t("stats.catalog")}
                    hint={t("stats.catalogHint")}
                    owned={productsOwned}
                    total={productsTotal}
                    tone="master"
                    icon={<Boxes className="size-4 text-primary" />}
                  />
                  <CompletionBar
                    label={t("stats.units")}
                    hint={t("stats.unitsHint")}
                    owned={unitsOwned}
                    total={unitsTotal}
                    tone="game"
                    icon={<Package className="size-4 text-emerald-500" />}
                  />
                  <CompletionBar
                    label={t("stats.paint")}
                    hint={t("stats.paintHint")}
                    owned={stats.paintedCopies}
                    total={stats.paintableCopies}
                    tone="paint"
                    icon={<Brush className="size-4 text-amber-500" />}
                  />
                </div>
              )}
            </div>
          )}

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
                  onManage={() => setManaged(item)}
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
                apiBasePath={apiBasePath}
                onChanged={(quantity) => refreshQuantity(managed.id, quantity)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
