"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  Layers,
  LayoutGrid,
  Package,
  Boxes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import CollectionManager from "@/app/games/[gameSlugOrId]/cards/[cardId]/CollectionManager";
import AddToWishlistButton from "@/components/AddToWishlistButton";
import { CompletionBar } from "@/app/collection/CollectionOverview";
import type { CardVariant, CollectionItem, GameCollectionResult } from "@/lib/db/collection";

type Props = {
  gameSlug: string;
  gameName: string;
  initialData: GameCollectionResult;
  /** Link prefix for the overview/sets/boosters/card-detail navigation. Override for a play-group's collection. */
  basePath?: string;
  /** API prefix for reads/writes. Override to manage a play-group's shared collection instead of the current user's. */
  apiBasePath?: string;
  /** Boosters aren't tracked per play-group yet, so group pages hide the link. */
  showBoosters?: boolean;
};

type ManageableCard = Pick<CollectionItem, "id" | "name" | "setCode" | "collectorNumber" | "image" | "quantity">;

export default function GameCollectionBrowser({
  gameSlug,
  gameName,
  initialData,
  basePath = "/collection",
  apiBasePath = "/api/collection",
  showBoosters = true,
}: Props) {
  const t = useTranslations("Collection");

  const [items, setItems] = useState<CollectionItem[]>(initialData.items);
  const [stats, setStats] = useState(initialData.stats);
  const [setCodes] = useState(initialData.setCodes);
  const [types] = useState(initialData.types);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const [totalPages, setTotalPages] = useState(initialData.totalPages);

  const [search, setSearch] = useState("");
  const [setCode, setSetCode] = useState("all");
  const [type, setType] = useState("all");
  const [ownership, setOwnership] = useState<"all" | "owned" | "unowned">("all");
  const [loading, setLoading] = useState(false);

  const [manageCard, setManageCard] = useState<ManageableCard | null>(null);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [variants, setVariants] = useState<CardVariant[] | null>(null);
  const [variantsLoading, setVariantsLoading] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);

  const fetchPage = useCallback(
    async (opts: { search: string; setCode: string; type: string; ownership: "all" | "owned" | "unowned"; page: number }) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(opts.page), limit: "48" });
        if (opts.search.trim()) params.set("search", opts.search.trim());
        if (opts.setCode !== "all") params.set("setCode", opts.setCode);
        if (opts.type !== "all") params.set("type", opts.type);
        if (opts.ownership === "owned") params.set("owned", "true");
        if (opts.ownership === "unowned") params.set("owned", "false");

        const res = await fetch(`${apiBasePath}/games/${gameSlug}?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data: GameCollectionResult = await res.json();
        if (controller.signal.aborted) return;
        setItems(data.items);
        setStats(data.stats);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
      } catch (error) {
        if (!controller.signal.aborted) console.error("Failed to load collection:", error);
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [gameSlug, apiBasePath]
  );

  // Debounced refetch on filter changes (skip first render — SSR provided initial data).
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    const delay = search.trim() ? 300 : 0;
    const timer = window.setTimeout(() => {
      void fetchPage({ search, setCode, type, ownership, page: 1 });
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, setCode, type, ownership]);

  // Fetch other printings of the open card's name (only re-fetches when the name
  // changes, so clicking between variants of the same card doesn't re-fetch).
  useEffect(() => {
    if (!manageCard) {
      setVariants(null);
      return;
    }
    const controller = new AbortController();
    setVariantsLoading(true);
    fetch(`${apiBasePath}/games/${gameSlug}/variants?name=${encodeURIComponent(manageCard.name)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CardVariant[]) => {
        if (!controller.signal.aborted) setVariants(data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setVariants([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setVariantsLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageCard?.name, gameSlug, apiBasePath]);

  const goToPage = (next: number) => {
    if (next < 1 || next > totalPages || loading) return;
    void fetchPage({ search, setCode, type, ownership, page: next });
  };

  const setQuantity = (cardId: string, quantity: number) => {
    setItems((prev) => prev.map((it) => (it.id === cardId ? { ...it, quantity } : it)));
  };

  const addOne = async (card: CollectionItem) => {
    setBusyCardId(card.id);
    const previous = card.quantity;
    setQuantity(card.id, previous + 1); // optimistic
    try {
      const res = await fetch(`${apiBasePath}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.id,
          name: card.name,
          setCode: card.setCode,
          collectorNumber: String(card.collectorNumber),
          image: card.image,
        }),
      });
      if (!res.ok) setQuantity(card.id, previous);
    } catch {
      setQuantity(card.id, previous);
    } finally {
      setBusyCardId(null);
    }
  };

  const removeOne = async (card: CollectionItem) => {
    if (card.quantity <= 0) return;
    setBusyCardId(card.id);
    const previous = card.quantity;
    setQuantity(card.id, previous - 1); // optimistic
    try {
      const res = await fetch(`${apiBasePath}/cards/${encodeURIComponent(card.id)}`, { method: "DELETE" });
      if (!res.ok) setQuantity(card.id, previous);
    } catch {
      setQuantity(card.id, previous);
    } finally {
      setBusyCardId(null);
    }
  };

  const resultRange =
    total === 0
      ? { start: 0, end: 0 }
      : { start: (page - 1) * initialData.limit + 1, end: Math.min(page * initialData.limit, total) };

  const activeSetStats = useMemo(
    () => (setCode !== "all" ? stats?.sets.find((s) => s.setCode === setCode) ?? null : null),
    [stats, setCode]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          href={basePath}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("game.backToOverview")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{gameName}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link href={`${basePath}/${gameSlug}/sets`}>
                <Boxes className="size-4" />
                {t("sets.title")}
              </Link>
            </Button>
            {showBoosters && (
              <Button asChild variant="outline" className="gap-2">
                <Link href={`${basePath}/${gameSlug}/boosters`}>
                  <Package className="size-4" />
                  {t("boosters.title")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Completion — whole game, or the selected set when a set filter is active */}
      {activeSetStats ? (
        <div className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <CompletionBar
            label={`${t("masterSet.label")} · ${activeSetStats.setCode}`}
            hint={t("masterSet.hint")}
            owned={activeSetStats.masterOwned}
            total={activeSetStats.masterTotal}
            tone="master"
            icon={<Layers className="size-4 text-primary" />}
          />
          <CompletionBar
            label={`${t("gameSet.label")} · ${activeSetStats.setCode}`}
            hint={t("gameSet.hint")}
            owned={activeSetStats.gameOwned}
            total={activeSetStats.gameTotal}
            tone="game"
            icon={<LayoutGrid className="size-4 text-emerald-500" />}
          />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <CompletionBar
            label={t("masterSet.label")}
            hint={t("masterSet.hint")}
            owned={stats.masterOwned}
            total={stats.masterTotal}
            tone="master"
            icon={<Layers className="size-4 text-primary" />}
          />
          <CompletionBar
            label={t("gameSet.label")}
            hint={t("gameSet.hint")}
            owned={stats.gameOwned}
            total={stats.gameTotal}
            tone="game"
            icon={<LayoutGrid className="size-4 text-emerald-500" />}
          />
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {setCodes.length > 0 ? (
            <Select value={setCode} onValueChange={setSetCode}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder={t("filters.allSets")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allSets")}</SelectItem>
                {setCodes.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {types.length > 0 ? (
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("filters.allTypes")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allTypes")}</SelectItem>
                {types.map((ty) => (
                  <SelectItem key={ty} value={ty}>
                    {ty}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setOwnership("all")}
              aria-pressed={ownership === "all"}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                ownership === "all" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("filters.all")}
            </button>
            <button
              type="button"
              onClick={() => setOwnership("owned")}
              aria-pressed={ownership === "owned"}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                ownership === "owned" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("filters.ownedOnly")}
            </button>
            <button
              type="button"
              onClick={() => setOwnership("unowned")}
              aria-pressed={ownership === "unowned"}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                ownership === "unowned" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("filters.notOwned")}
            </button>
          </div>
        </div>
      </div>

      {/* Result meta */}
      <div className="flex min-h-5 items-center justify-between text-sm text-muted-foreground">
        <span>{t("filters.results", { count: total })}</span>
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      </div>

      {/* Grid */}
      {items.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <SlidersHorizontal className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("filters.noResults")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((card) => {
            const owned = card.quantity > 0;
            return (
              <div
                key={card.id}
                className={`group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md ${
                  owned ? "ring-1 ring-emerald-500/40" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setManageCard(card)}
                  className="relative block aspect-[3/4] w-full overflow-hidden bg-muted"
                  aria-label={t("card.manage", { name: card.name })}
                >
                  <Image
                    src={card.image}
                    alt={card.name}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 45vw, (max-width: 1280px) 20vw, 160px"
                    className={`object-cover transition-transform group-hover:scale-[1.03] ${owned ? "" : "opacity-60 grayscale-[35%]"}`}
                  />
                  {owned ? (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white shadow tabular-nums">
                      ×{card.quantity}
                    </span>
                  ) : null}
                </button>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-tight" title={card.name}>
                      {card.name}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <span className="truncate">
                        {card.setCode} #{card.collectorNumber}
                      </span>
                      {card.variantsOwned > 0 ? (
                        <span
                          className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                          title={t("card.variantsBadgeHint")}
                        >
                          {t("card.variantsBadge", { count: card.variantsOwned })}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="size-7"
                      disabled={!owned || busyCardId === card.id}
                      onClick={() => removeOne(card)}
                      aria-label={t("card.removeOne")}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="flex-1 text-center text-sm font-semibold tabular-nums">{card.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="size-7"
                      disabled={busyCardId === card.id}
                      onClick={() => addOne(card)}
                      aria-label={t("card.addOne")}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            {t("filters.range", { start: resultRange.start, end: resultRange.end, total })}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1 || loading} onClick={() => goToPage(page - 1)}>
              {t("filters.previous")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("filters.pageOf", { page, totalPages })}
            </span>
            <Button variant="outline" size="sm" disabled={page === totalPages || loading} onClick={() => goToPage(page + 1)}>
              {t("filters.next")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Manage dialog (full attributes) */}
      <Dialog open={manageCard !== null} onOpenChange={(open) => !open && setManageCard(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {manageCard ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {manageCard.name}
                  <span className="text-sm font-normal text-muted-foreground">
                    {manageCard.setCode} #{manageCard.collectorNumber}
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="mx-auto flex w-40 flex-col gap-2 sm:mx-0">
                  <Image
                    src={manageCard.image}
                    alt={manageCard.name}
                    width={200}
                    height={280}
                    unoptimized
                    className="h-auto w-40 rounded-lg shadow"
                  />
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <Link href={`/games/${gameSlug}/cards/${manageCard.id}`}>
                      <ExternalLink className="size-3.5" />
                      {t("card.viewDetails")}
                    </Link>
                  </Button>
                  <AddToWishlistButton
                    cardId={manageCard.id}
                    gameSlug={gameSlug}
                    cardName={manageCard.name}
                    setCode={manageCard.setCode}
                    collectorNumber={String(manageCard.collectorNumber)}
                    image={manageCard.image}
                  />
                </div>
                <div className="flex-1">
                  <CollectionManager
                    cardId={manageCard.id}
                    gameSlug={gameSlug}
                    cardName={manageCard.name}
                    setCode={manageCard.setCode}
                    collectorNumber={String(manageCard.collectorNumber)}
                    image={manageCard.image}
                    onChange={(quantity) => setQuantity(manageCard.id, quantity)}
                    apiBasePath={apiBasePath}
                  />
                </div>
              </div>

              {/* Other printings of this same card (e.g. alt arts) */}
              {(() => {
                const otherVariants = (variants ?? []).filter(
                  (v) => !(v.setCode === manageCard.setCode && v.collectorNumber === manageCard.collectorNumber)
                );
                if (!variantsLoading && otherVariants.length === 0) return null;
                return (
                  <div className="mt-2 border-t pt-3">
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                      {t("card.variantsSectionTitle")}
                      {variantsLoading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {otherVariants.map((variant) => (
                        <button
                          key={`${variant.setCode}-${variant.collectorNumber}`}
                          type="button"
                          onClick={() => setManageCard(variant)}
                          className="flex items-center gap-2 rounded-lg border p-1.5 text-left transition-colors hover:bg-accent"
                        >
                          <Image
                            src={variant.image}
                            alt={variant.name}
                            width={40}
                            height={56}
                            unoptimized
                            className="h-14 w-10 shrink-0 rounded object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs text-muted-foreground">
                              {variant.setCode} #{variant.collectorNumber}
                            </p>
                            <p
                              className={`text-xs font-semibold tabular-nums ${
                                variant.quantity > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                              }`}
                            >
                              ×{variant.quantity}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
