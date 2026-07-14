"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Heart, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Wishlist } from "@/lib/types/Wishlist";

type MyWishlists = {
  personal: Wishlist[];
  groups: { group: { id: string; name: string }; wishlists: Wishlist[] }[];
};

type AddToWishlistButtonProps = {
  cardId: string;
  gameSlug: string;
  cardName: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  type?: string;
};

export default function AddToWishlistButton({
  cardId,
  gameSlug,
  cardName,
  setCode,
  collectorNumber,
  image,
  type,
}: AddToWishlistButtonProps) {
  const t = useTranslations("Wishlists");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<MyWishlists | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadWishlists() {
    setLoading(true);
    try {
      const res = await fetch("/api/wishlists/mine");
      if (res.ok) {
        setData(await res.json());
        setLoaded(true);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !loaded) void loadWishlists();
  }

  async function handleAdd(wishlist: Wishlist) {
    setAddingId(wishlist.id);
    try {
      const res = await fetch(`/api/wishlists/${wishlist.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameSlug,
          cardId,
          name: cardName,
          setCode,
          collectorNumber,
          image,
          ...(type !== undefined && { type }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || t("errors.addItem"));
        return;
      }
      setAddedIds((prev) => new Set(prev).add(wishlist.id));
      toast.success(t("addToWishlist.added", { wishlist: wishlist.name }));
    } finally {
      setAddingId(null);
    }
  }

  async function handleCreateAndAdd() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/wishlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, visibility: "private" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || t("errors.create"));
        return;
      }
      const wishlist: Wishlist = await res.json();
      setData((prev) =>
        prev ? { ...prev, personal: [wishlist, ...prev.personal] } : { personal: [wishlist], groups: [] }
      );
      setNewName("");
      await handleAdd(wishlist);
    } finally {
      setCreating(false);
    }
  }

  const hasAnyWishlist = !!data && (data.personal.length > 0 || data.groups.length > 0);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Heart className="size-4" />
          {t("addToWishlist.trigger")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("addToWishlist.loading")}
              </div>
            ) : (
              <>
                {loaded && !hasAnyWishlist && <CommandEmpty>{t("addToWishlist.empty")}</CommandEmpty>}
                {data && data.personal.length > 0 && (
                  <CommandGroup heading={t("addToWishlist.personalHeading")}>
                    {data.personal.map((wishlist) => (
                      <CommandItem
                        key={wishlist.id}
                        value={wishlist.id}
                        disabled={addingId === wishlist.id}
                        onSelect={() => handleAdd(wishlist)}
                      >
                        {addedIds.has(wishlist.id) ? (
                          <Check className="mr-2 size-4 text-emerald-500" />
                        ) : addingId === wishlist.id ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 size-4 text-muted-foreground" />
                        )}
                        <span className="truncate">{wishlist.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {data?.groups.map(({ group, wishlists }) => (
                  <CommandGroup key={group.id} heading={group.name}>
                    {wishlists.map((wishlist) => (
                      <CommandItem
                        key={wishlist.id}
                        value={wishlist.id}
                        disabled={addingId === wishlist.id}
                        onSelect={() => handleAdd(wishlist)}
                      >
                        {addedIds.has(wishlist.id) ? (
                          <Check className="mr-2 size-4 text-emerald-500" />
                        ) : addingId === wishlist.id ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 size-4 text-muted-foreground" />
                        )}
                        <span className="truncate">{wishlist.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
                <CommandGroup>
                  <div className="flex items-center gap-1.5 p-1.5">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t("addToWishlist.newPlaceholder")}
                      className="h-8"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCreateAndAdd();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-8 shrink-0 gap-1"
                      onClick={handleCreateAndAdd}
                      disabled={creating || !newName.trim()}
                    >
                      {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    </Button>
                  </div>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
