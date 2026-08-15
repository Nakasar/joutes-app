"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Boxes, Brush, Loader2, Package, PackageX, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { PRODUCT_KIND_KEYS } from "@/lib/constants/product-kinds";
import { ALL_EDITIONS } from "@/lib/constants/product-editions";
import type { ProductCollectionItem, ProductCollectionResult } from "@/lib/db/products-collection";
import ProductTile from "@/components/products/ProductTile";
import ProductManager from "@/components/products/ProductManager";

type Ownership = "all" | "owned" | "unowned";
type Shape = "all" | "containers" | "units";

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
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const [totalPages, setTotalPages] = useState(initialData.totalPages);

  const [search, setSearch] = useState("");
  const [setCode, setSetCode] = useState("all");
  const [kind, setKind] = useState("all");
  // Aligné sur ce que la route a déjà appliqué au premier rendu.
  const [edition, setEdition] = useState(currentEdition ?? ALL_EDITIONS);
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [shape, setShape] = useState<Shape>("all");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [managed, setManaged] = useState<ProductCollectionItem | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);

  const fetchPage = useCallback(
    async (next: {
      search: string;
      setCode: string;
      edition: string;
      kind: string;
      ownership: Ownership;
      shape: Shape;
      page: number;
    }) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setLoading(true);
      setLoadError(false);
      try {
        const params = new URLSearchParams({ page: String(next.page), limit: String(initialData.limit) });
        if (next.search) params.set("search", next.search);
        if (next.setCode !== "all") params.set("setCode", next.setCode);
        // Toujours transmis : sans le paramètre, la route appliquerait son
        // propre défaut, et « toutes les éditions » ne lèverait rien.
        params.set("edition", next.edition);
        if (next.kind !== "all") params.set("kind", next.kind);
        if (next.ownership !== "all") params.set("owned", String(next.ownership === "owned"));
        if (next.shape !== "all") params.set("containers", String(next.shape === "containers"));

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
      void fetchPage({ search, setCode, kind, edition, ownership, shape, page: 1 });
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, setCode, kind, edition, ownership, shape, fetchPage]);

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
      void fetchPage({ search, setCode, kind, edition, ownership, shape, page });
    }
  };

  const activeSet = setCode !== "all" ? stats?.sets.find((row) => row.setCode === setCode) : undefined;
  const productsOwned = activeSet?.productsOwned ?? stats?.productsOwned ?? 0;
  const productsTotal = activeSet?.productsTotal ?? stats?.productsTotal ?? 0;
  const unitsOwned = activeSet?.unitsOwned ?? stats?.unitsOwned ?? 0;
  const unitsTotal = activeSet?.unitsTotal ?? stats?.unitsTotal ?? 0;

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

      {stats && (
        <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-3">
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            className="pl-9"
          />
        </div>

        {setCodes.length > 0 && (
          <Select value={setCode} onValueChange={setSetCode}>
            <SelectTrigger className="w-auto min-w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.allSets")}</SelectItem>
              {setCodes.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {editions.length > 0 && (
          <Select value={edition} onValueChange={setEdition}>
            <SelectTrigger className="w-auto min-w-[10rem]">
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
        )}

        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-auto min-w-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allKinds")}</SelectItem>
            {PRODUCT_KIND_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`kinds.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5 text-sm">
          {(["all", "containers", "units"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={shape === value}
              onClick={() => setShape(value)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                shape === value ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t(`filters.shape.${value}`)}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5 text-sm">
          {(["all", "owned", "unowned"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={ownership === value}
              onClick={() => setOwnership(value)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                ownership === value ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t(`filters.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{t("filters.results", { count: total })}</span>
        {loading && <Loader2 className="size-4 animate-spin" />}
      </div>

      {loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <SlidersHorizontal className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("empty.loadError")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchPage({ search, setCode, kind, edition, ownership, shape, page })}
          >
            {t("filters.retry")}
          </Button>
        </div>
      ) : items.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <PackageX className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {total === 0 && !search && setCode === "all" && kind === "all" && ownership === "all"
              ? t("empty.noCatalog", { game: gameName })
              : t("empty.noResults")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <ProductTile
              key={item.id}
              product={item}
              kindLabel={t(`kinds.${item.kind}`)}
              editionLabel={
                item.edition && item.edition !== currentEdition ? t("tile.edition", { edition: item.edition }) : undefined
              }
              onManage={() => setManaged(item)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => void fetchPage({ search, setCode, kind, edition, ownership, shape, page: page - 1 })}
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
            onClick={() => void fetchPage({ search, setCode, kind, edition, ownership, shape, page: page + 1 })}
          >
            {t("filters.next")}
          </Button>
        </div>
      )}

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
