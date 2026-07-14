"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Globe,
  Link as LinkIcon,
  Loader2,
  Lock,
  Minus,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Wishlist, WishlistItem, WishlistVisibility } from "@/lib/types/Wishlist";
import type { PaginatedWishlistItems } from "@/lib/db/wishlists";
import type { Game } from "@/lib/types/Game";
import type { BoosterCard } from "@/lib/types/booster";
import { useRouter } from "next/navigation";

const VISIBILITY_ICONS: Record<WishlistVisibility, React.ReactNode> = {
  private: <Lock className="size-3.5" />,
  unlisted: <LinkIcon className="size-3.5" />,
  public: <Globe className="size-3.5" />,
};

type SearchCard = BoosterCard & { type?: string };

export default function WishlistDetailClient({
  wishlist: initialWishlist,
  initialItems,
  canEdit,
  games,
  isLoggedIn,
}: {
  wishlist: Wishlist;
  initialItems: PaginatedWishlistItems;
  canEdit: boolean;
  games: Game[];
  isLoggedIn: boolean;
}) {
  const t = useTranslations("Wishlists");
  const router = useRouter();

  const [wishlist, setWishlist] = useState(initialWishlist);
  const [items, setItems] = useState(initialItems.items);
  const [total, setTotal] = useState(initialItems.total);
  const [page, setPage] = useState(initialItems.page);
  const [totalPages, setTotalPages] = useState(initialItems.totalPages);
  const [gamesFacet, setGamesFacet] = useState(initialItems.games);
  const [typesFacet, setTypesFacet] = useState(initialItems.types);

  const [search, setSearch] = useState("");
  const [gameFilter, setGameFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [minOwned, setMinOwned] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const initializedRef = useRef(false);

  const fetchItems = useCallback(
    async (opts: {
      search: string;
      gameId: string;
      type: string;
      page: number;
      ownedOnly: boolean;
      minOwned: number;
    }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(opts.page), limit: "48" });
        if (opts.search.trim()) params.set("search", opts.search.trim());
        if (opts.gameId !== "all") params.set("gameId", opts.gameId);
        if (opts.type !== "all") params.set("type", opts.type);
        if (opts.ownedOnly) params.set("minOwned", String(opts.minOwned));

        const res = await fetch(`/api/wishlists/${wishlist.id}/items?${params.toString()}`);
        if (!res.ok) return;
        const data: PaginatedWishlistItems = await res.json();
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setGamesFacet(data.games);
        setTypesFacet(data.types);
      } finally {
        setLoading(false);
      }
    },
    [wishlist.id]
  );

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    const delay = search.trim() ? 300 : 0;
    const timer = window.setTimeout(() => {
      void fetchItems({ search, gameId: gameFilter, type: typeFilter, page: 1, ownedOnly, minOwned });
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, gameFilter, typeFilter, ownedOnly, minOwned]);

  const goToPage = (next: number) => {
    if (next < 1 || next > totalPages || loading) return;
    void fetchItems({ search, gameId: gameFilter, type: typeFilter, page: next, ownedOnly, minOwned });
  };

  async function handleRemove(item: WishlistItem) {
    setBusyItemId(item.id);
    try {
      const res = await fetch(`/api/wishlists/${wishlist.id}/items/${item.id}`, { method: "DELETE" });
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

  async function handleQuantityChange(item: WishlistItem, quantity: number) {
    if (quantity < 1) return;
    setBusyItemId(item.id);
    try {
      const res = await fetch(`/api/wishlists/${wishlist.id}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      if (!res.ok) {
        toast.error(t("errors.updateItem"));
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity } : i)));
    } finally {
      setBusyItemId(null);
    }
  }

  function handleItemAdded(item: WishlistItem) {
    setItems((prev) => [item, ...prev]);
    setTotal((prev) => prev + 1);
    setGamesFacet((prev) =>
      prev.some((g) => g.gameId === item.gameId) ? prev : [...prev, { gameId: item.gameId, gameName: item.gameName, gameSlug: item.gameSlug }]
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={wishlist.ownerType === "playGroup" ? `/play-groups/${wishlist.ownerId}/wishlists` : "/wishlists"}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("detail.back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{wishlist.name}</h1>
            <Badge variant="outline" className="gap-1">
              {VISIBILITY_ICONS[wishlist.visibility]}
              {t(`visibility.${wishlist.visibility}`)}
            </Badge>
          </div>
          {wishlist.description && <p className="text-muted-foreground">{wishlist.description}</p>}
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <EditWishlistDialog wishlist={wishlist} onSaved={setWishlist} />
            <DeleteWishlistButton wishlist={wishlist} onDeleted={() => router.push(wishlist.ownerType === "playGroup" ? `/play-groups/${wishlist.ownerId}/wishlists` : "/wishlists")} />
            <AddItemDialog wishlistId={wishlist.id} games={games} onAdded={handleItemAdded} />
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
          {isLoggedIn && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-1.5">
              <Button
                type="button"
                variant={ownedOnly ? "default" : "outline"}
                size="sm"
                className="h-7 gap-1.5"
                onClick={() => setOwnedOnly((v) => !v)}
              >
                <PackageCheck className="size-3.5" />
                {t("detail.ownedOnly")}
              </Button>
              {ownedOnly && (
                <div className="flex items-center gap-1.5 pr-1 text-sm">
                  <Label htmlFor="min-owned" className="text-xs text-muted-foreground">
                    {t("detail.minOwned")}
                  </Label>
                  <Input
                    id="min-owned"
                    type="number"
                    min={1}
                    max={99}
                    value={minOwned}
                    onChange={(e) => setMinOwned(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="h-7 w-16 px-2"
                  />
                </div>
              )}
            </div>
          )}
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
                {isLoggedIn && (item.ownedQuantity ?? 0) > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                    <PackageCheck className="size-3" />×{item.ownedQuantity}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-tight" title={item.name}>
                    {item.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.setCode} #{item.collectorNumber}
                  </p>
                  {isLoggedIn && item.ownedQuantity !== undefined && (
                    <p
                      className={`text-xs font-medium ${
                        item.ownedQuantity > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                      }`}
                    >
                      {item.ownedQuantity > 0
                        ? t("detail.ownedCount", { count: item.ownedQuantity })
                        : t("detail.notOwned")}
                    </p>
                  )}
                </div>
                {canEdit ? (
                  <div className="mt-auto flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="size-7"
                      disabled={busyItemId === item.id || item.quantity <= 1}
                      onClick={() => handleQuantityChange(item, item.quantity - 1)}
                      aria-label={t("detail.decreaseQuantity")}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="flex-1 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="size-7"
                      disabled={busyItemId === item.id}
                      onClick={() => handleQuantityChange(item, item.quantity + 1)}
                      aria-label={t("detail.increaseQuantity")}
                    >
                      <Plus className="size-3.5" />
                    </Button>
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
                ) : (
                  <p className="mt-auto text-xs text-muted-foreground">{t("detail.quantityWanted", { count: item.quantity })}</p>
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

function EditWishlistDialog({ wishlist, onSaved }: { wishlist: Wishlist; onSaved: (w: Wishlist) => void }) {
  const t = useTranslations("Wishlists");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(wishlist.name);
  const [description, setDescription] = useState(wishlist.description ?? "");
  const [visibility, setVisibility] = useState<WishlistVisibility>(wishlist.visibility);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/wishlists/${wishlist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          visibility,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("errors.update"));
        return;
      }
      const updated: Wishlist = await res.json();
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
            <Label htmlFor="edit-name">{t("form.name")}</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-description">{t("form.description")}</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("form.visibility")}</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as WishlistVisibility)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">{t("visibility.private")}</SelectItem>
                <SelectItem value="unlisted">{t("visibility.unlisted")}</SelectItem>
                <SelectItem value="public">{t("visibility.public")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t(`visibility.${visibility}Hint`)}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            {t("form.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("edit.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteWishlistButton({ wishlist, onDeleted }: { wishlist: Wishlist; onDeleted: () => void }) {
  const t = useTranslations("Wishlists");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/wishlists/${wishlist.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(t("errors.delete"));
        return;
      }
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" disabled={deleting}>
          <Trash2 className="size-3.5" />
          {t("card.delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("delete.description", { name: wishlist.name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("form.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {t("delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AddItemDialog({
  wishlistId,
  games,
  onAdded,
}: {
  wishlistId: string;
  games: Game[];
  onAdded: (item: WishlistItem) => void;
}) {
  const t = useTranslations("Wishlists");
  const [open, setOpen] = useState(false);
  const [gameSlug, setGameSlug] = useState(games[0]?.slug ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);

  async function handleSearch() {
    if (!gameSlug) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ searchQuery: query, limit: "24" });
      const res = await fetch(`/api/games/${gameSlug}/cards?${params.toString()}`);
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json();
      setResults(Array.isArray(data.cards) ? data.cards : []);
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(card: SearchCard) {
    setAddingCardId(card.id);
    try {
      const res = await fetch(`/api/wishlists/${wishlistId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameSlug,
          cardId: card.id,
          name: card.name,
          setCode: card.setCode,
          collectorNumber: String(card.collectorNumber ?? ""),
          image: card.image,
          type: card.type,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("errors.addItem"));
        return;
      }
      const item: WishlistItem = await res.json();
      onAdded(item);
      toast.success(t("addItem.added", { name: card.name }));
    } finally {
      setAddingCardId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-3.5" />
          {t("addItem.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("addItem.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={gameSlug} onValueChange={setGameSlug}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t("addItem.selectGame")} />
              </SelectTrigger>
              <SelectContent>
                {games.map((g) => (
                  <SelectItem key={g.id} value={g.slug ?? g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={t("addItem.searchPlaceholder")}
              />
            </div>
            <Button onClick={handleSearch} disabled={searching || !gameSlug} className="gap-1.5">
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {t("addItem.search")}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {results.map((card) => (
                <div key={card.id} className="flex flex-col overflow-hidden rounded-lg border">
                  <div className="relative aspect-[3/4] w-full bg-muted">
                    <Image src={card.image} alt={card.name} fill unoptimized sizes="150px" className="object-cover" />
                  </div>
                  <div className="flex flex-col gap-1 p-1.5">
                    <p className="truncate text-xs font-medium" title={card.name}>
                      {card.name}
                    </p>
                    <Button
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      disabled={addingCardId === card.id}
                      onClick={() => handleAdd(card)}
                    >
                      {addingCardId === card.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Plus className="size-3" />
                      )}
                      {t("addItem.add")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
