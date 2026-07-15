"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Globe,
  Loader2,
  Pencil,
  SlidersHorizontal,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { SellList, SellListItem } from "@/lib/types/SellList";
import type { PaginatedSellListItems, SellListOwnerInfo } from "@/lib/db/sell-lists";

const CURRENCIES = ["EUR", "USD", "GBP", "JPY", "CNY"] as const;
type CurrencyCode = (typeof CURRENCIES)[number];

function formatPrice(price: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { style: "currency", currency }).format(price);
}

export default function SellListDetailClient({
  sellList: initialSellList,
  initialItems,
  canEdit,
  ownerInfo,
  locale,
}: {
  sellList: SellList;
  initialItems: PaginatedSellListItems;
  canEdit: boolean;
  ownerInfo: SellListOwnerInfo | null;
  locale: string;
}) {
  const t = useTranslations("SellLists");

  const [sellList, setSellList] = useState(initialSellList);
  const [items, setItems] = useState(initialItems.items);
  const [total, setTotal] = useState(initialItems.total);
  const [page, setPage] = useState(initialItems.page);
  const [totalPages, setTotalPages] = useState(initialItems.totalPages);
  const [gamesFacet, setGamesFacet] = useState(initialItems.games);
  const [typesFacet, setTypesFacet] = useState(initialItems.types);
  const [conditionsFacet, setConditionsFacet] = useState(initialItems.conditions);

  const [search, setSearch] = useState("");
  const [gameFilter, setGameFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const initializedRef = useRef(false);

  const fetchItems = useCallback(
    async (opts: {
      search: string;
      gameId: string;
      type: string;
      condition: string;
      priceMin: string;
      priceMax: string;
      page: number;
    }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(opts.page), limit: "48" });
        if (opts.search.trim()) params.set("search", opts.search.trim());
        if (opts.gameId !== "all") params.set("gameId", opts.gameId);
        if (opts.type !== "all") params.set("type", opts.type);
        if (opts.condition !== "all") params.set("condition", opts.condition);
        if (opts.priceMin.trim()) params.set("priceMin", opts.priceMin.trim());
        if (opts.priceMax.trim()) params.set("priceMax", opts.priceMax.trim());

        const res = await fetch(`/api/sell-lists/${sellList.id}/items?${params.toString()}`);
        if (!res.ok) return;
        const data: PaginatedSellListItems = await res.json();
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setGamesFacet(data.games);
        setTypesFacet(data.types);
        setConditionsFacet(data.conditions);
      } finally {
        setLoading(false);
      }
    },
    [sellList.id]
  );

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    const delay = search.trim() ? 300 : 0;
    const timer = window.setTimeout(() => {
      void fetchItems({ search, gameId: gameFilter, type: typeFilter, condition: conditionFilter, priceMin, priceMax, page: 1 });
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, gameFilter, typeFilter, conditionFilter, priceMin, priceMax]);

  const goToPage = (next: number) => {
    if (next < 1 || next > totalPages || loading) return;
    void fetchItems({ search, gameId: gameFilter, type: typeFilter, condition: conditionFilter, priceMin, priceMax, page: next });
  };

  async function handleRemove(item: SellListItem) {
    setBusyItemId(item.id);
    try {
      const res = await fetch(`/api/sell-lists/${sellList.id}/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(t("errors.removeItem"));
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setTotal((prev) => prev - 1);
    } finally {
      setBusyItemId(null);
    }
  }

  function handleItemUpdated(updated: SellListItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  const backHref = sellList.ownerType === "playGroup" ? `/play-groups/${sellList.ownerId}` : "/sell-lists";

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("detail.back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("detail.title")}</h1>
            <Badge variant="outline" className="gap-1">
              <Globe className="size-3.5" />
              {t("detail.public")}
            </Badge>
          </div>
          {ownerInfo && (
            <Link href={ownerInfo.href} className="text-sm text-muted-foreground hover:text-foreground hover:underline w-fit">
              {t(sellList.ownerType === "playGroup" ? "detail.ownerGroup" : "detail.ownerUser", { name: ownerInfo.label })}
            </Link>
          )}
          {sellList.description && <p className="text-muted-foreground whitespace-pre-wrap">{sellList.description}</p>}
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <EditSellListDialog sellList={sellList} onSaved={setSellList} />
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/collection">
                <Tag className="size-3.5" />
                {t("detail.addFromCollection")}
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("detail.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gamesFacet.length > 0 && (
            <Select value={gameFilter} onValueChange={setGameFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={t("detail.allGames")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("detail.allGames")}</SelectItem>
                {gamesFacet.map((g) => (
                  <SelectItem key={g.gameId} value={g.gameId}>
                    {g.gameName ?? g.gameId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {typesFacet.length > 0 && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("detail.allTypes")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("detail.allTypes")}</SelectItem>
                {typesFacet.map((ty) => (
                  <SelectItem key={ty} value={ty}>
                    {ty}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {conditionsFacet.length > 0 && (
            <Select value={conditionFilter} onValueChange={setConditionFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("detail.allConditions")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("detail.allConditions")}</SelectItem>
                {conditionsFacet.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder={t("detail.priceMin")}
              className="w-24"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder={t("detail.priceMax")}
              className="w-24"
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-5 items-center justify-between text-sm text-muted-foreground">
        <span>{t("detail.results", { count: total })}</span>
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      </div>

      {items.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <SlidersHorizontal className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("detail.noResults")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col overflow-hidden rounded-xl border bg-card">
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
                <Image src={item.image} alt={item.name} fill unoptimized sizes="200px" className="object-cover" />
                {item.gameName && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {item.gameName}
                  </span>
                )}
                <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                  {item.price !== undefined && item.currency ? formatPrice(item.price, item.currency, locale) : t("detail.noPrice")}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-tight" title={item.name}>
                    {item.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.setCode} #{item.collectorNumber}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.foil && <Badge variant="secondary" className="text-[10px]">Foil</Badge>}
                    {item.condition && <Badge variant="outline" className="text-[10px]">{item.condition}</Badge>}
                    {item.language && <Badge variant="outline" className="text-[10px]">{item.language}</Badge>}
                  </div>
                  {item.note && <p className="mt-1 truncate text-xs text-muted-foreground" title={item.note}>{item.note}</p>}
                </div>
                {canEdit && (
                  <div className="mt-auto flex items-center gap-1">
                    <EditSellListItemDialog sellListId={sellList.id} item={item} onSaved={handleItemUpdated} />
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="size-7 text-destructive hover:text-destructive"
                      disabled={busyItemId === item.id}
                      onClick={() => handleRemove(item)}
                      aria-label={t("detail.removeItem")}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" disabled={page === 1 || loading} onClick={() => goToPage(page - 1)}>
            {t("detail.previous")}
          </Button>
          <span className="text-sm text-muted-foreground">{t("detail.pageOf", { page, totalPages })}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages || loading} onClick={() => goToPage(page + 1)}>
            {t("detail.next")}
          </Button>
        </div>
      )}
    </div>
  );
}

function EditSellListDialog({ sellList, onSaved }: { sellList: SellList; onSaved: (s: SellList) => void }) {
  const t = useTranslations("SellLists");
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(sellList.description ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/sell-lists/${sellList.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("errors.update"));
        return;
      }
      const updated: SellList = await res.json();
      onSaved(updated);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Pencil className="size-3.5" />
          {t("detail.editSettings")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label htmlFor="edit-description">{t("form.description")}</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={t("form.descriptionPlaceholder")}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            {t("form.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("edit.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditSellListItemDialog({
  sellListId,
  item,
  onSaved,
}: {
  sellListId: string;
  item: SellListItem;
  onSaved: (item: SellListItem) => void;
}) {
  const t = useTranslations("SellLists");
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(item.price !== undefined ? String(item.price) : "");
  const [currency, setCurrency] = useState<CurrencyCode>((item.currency as CurrencyCode) ?? "EUR");
  const [note, setNote] = useState(item.note ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmedPrice = price.trim();
    let parsedPrice: number | null = null;
    if (trimmedPrice) {
      parsedPrice = parseFloat(trimmedPrice);
      if (isNaN(parsedPrice) || parsedPrice < 0) return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sell-lists/${sellListId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: parsedPrice,
          ...(parsedPrice !== null && { currency }),
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("errors.updateItem"));
        return;
      }
      const updated: SellListItem = await res.json();
      onSaved(updated);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon-sm" className="size-7" aria-label={t("detail.editPrice")}>
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("detail.editPrice")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="item-price">{t("form.price")}</Label>
              <Input
                id="item-price"
                type="number"
                min={0}
                step="0.01"
                placeholder={t("form.priceOptional")}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="w-[110px] space-y-1">
              <Label>{t("form.currency")}</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="item-note">{t("form.note")}</Label>
            <Input id="item-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            {t("form.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("edit.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
