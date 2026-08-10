"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Library, Loader2, PackageX, Search, SlidersHorizontal } from "lucide-react";
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
import { PRODUCT_KIND_KEYS } from "@/lib/constants/product-kinds";
import type { ProductCollectionItem, ProductCollectionResult } from "@/lib/db/products-collection";
import ProductTile from "@/components/products/ProductTile";
import ProductManager from "@/components/products/ProductManager";

type Shape = "all" | "containers" | "units";

const EMPTY_CONTENT = { owned: 0, total: 0, complete: false };

/**
 * Catalogue d'un jeu. Le même écran sert connecté et déconnecté : sans session,
 * il n'y a simplement rien à marquer comme possédé, et la grille invite à se
 * connecter plutôt que de mentir avec des tuiles grises.
 */
export default function ProductsExplorer({
  gameSlug,
  gameName,
  initialData,
  setCodes,
  signedIn,
}: {
  gameSlug: string;
  gameName: string;
  /** Absent lorsque personne n'est connecté : le catalogue est alors chargé par la route publique. */
  initialData: ProductCollectionResult | null;
  setCodes: string[];
  signedIn: boolean;
}) {
  const t = useTranslations("Collection.products");

  const [items, setItems] = useState<ProductCollectionItem[]>(initialData?.items ?? []);
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [totalPages, setTotalPages] = useState(initialData?.totalPages ?? 1);

  const [search, setSearch] = useState("");
  const [setCode, setSetCode] = useState("all");
  const [kind, setKind] = useState("all");
  const [shape, setShape] = useState<Shape>("all");
  const [loading, setLoading] = useState(!initialData);
  const [loadError, setLoadError] = useState(false);

  const [managed, setManaged] = useState<ProductCollectionItem | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(Boolean(initialData));
  const dirtyRef = useRef(false);

  const fetchPage = useCallback(
    async (next: { search: string; setCode: string; kind: string; shape: Shape; page: number }) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setLoading(true);
      setLoadError(false);
      try {
        const params = new URLSearchParams({ page: String(next.page), limit: "48" });
        if (next.search) params.set("search", next.search);
        if (next.setCode !== "all") params.set("setCode", next.setCode);
        if (next.kind !== "all") params.set("kind", next.kind);
        if (next.shape !== "all") params.set("containers", String(next.shape === "containers"));

        // Connecté, la route de collection rend le même catalogue annoté de la
        // possession ; sinon, la route publique le rend nu.
        const url = signedIn
          ? `/api/collection/games/${encodeURIComponent(gameSlug)}/products?${params}`
          : `/api/games/${encodeURIComponent(gameSlug)}/products?${params}`;

        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("failed");
        const data = await response.json();

        setItems(
          (data.items as ProductCollectionItem[]).map((item) => ({
            ...item,
            quantity: item.quantity ?? 0,
            content: item.content ?? EMPTY_CONTENT,
          }))
        );
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

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      void fetchPage({ search, setCode, kind, shape, page: 1 });
      return;
    }

    const timeout = setTimeout(() => {
      void fetchPage({ search, setCode, kind, shape, page: 1 });
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, setCode, kind, shape, fetchPage]);

  const closeManager = () => {
    setManaged(null);
    if (dirtyRef.current) {
      dirtyRef.current = false;
      void fetchPage({ search, setCode, kind, shape, page });
    }
  };

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
      </div>

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchPage({ search, setCode, kind, shape, page })}
          >
            {t("filters.retry")}
          </Button>
        </div>
      ) : items.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <PackageX className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {total === 0 && !search && setCode === "all" && kind === "all"
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
              onManage={() => (signedIn ? setManaged(item) : undefined)}
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
            onClick={() => void fetchPage({ search, setCode, kind, shape, page: page - 1 })}
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
            onClick={() => void fetchPage({ search, setCode, kind, shape, page: page + 1 })}
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
