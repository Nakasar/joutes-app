"use client";

import { useEffect, useState } from "react";
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
import PrintingPicker from "@/components/PrintingPicker";
import { resolvePrinting } from "@/lib/cards/printings";
import type { CardPrinting } from "@/lib/types/card";
import type { Wishlist } from "@/lib/types/Wishlist";
import {
  invalidateMyWishlists,
  loadMyWishlists,
  readPreferredWishlistId,
  writePreferredWishlistId,
} from "@/lib/wishlists/my-wishlists-client";
import { type MyWishlists, pickShortcutWishlist } from "@/lib/wishlists/shortcut";

type AddToWishlistButtonProps = {
  cardId: string;
  gameSlug: string;
  cardName: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  type?: string;
  /** Carte qui n'existe qu'en foil. */
  cardFoil?: boolean;
  /** Variantes d'impression de la carte : le souhait porte sur l'une d'elles. */
  printings?: CardPrinting[];
  /** Render a compact circular icon button instead of a labeled one — for overlaying on card thumbnails. */
  iconOnly?: boolean;
  /** La carte est déjà dans une wishlist de l'utilisateur : cœur rouge rempli. */
  inWishlist?: boolean;
  /** Notifié après un ajout réussi (permet au parent de marquer la carte en wishlist). */
  onAdded?: () => void;
  className?: string;
};

export default function AddToWishlistButton({
  cardId,
  gameSlug,
  cardName,
  setCode,
  collectorNumber,
  image,
  type,
  cardFoil = false,
  printings,
  iconOnly = false,
  inWishlist = false,
  onAdded,
  className,
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
  const [printingId, setPrintingId] = useState("");
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const printingChoice = resolvePrinting({ foil: cardFoil, image, printings }, printingId || undefined);

  // Les listes sont chargées d'emblée — le raccourci doit pouvoir nommer sa
  // cible avant tout clic. Le cache partagé fait qu'une galerie de soixante
  // cartes ne déclenche qu'une requête.
  useEffect(() => {
    let cancelled = false;
    void loadMyWishlists().then((mine) => {
      if (!cancelled) setData(mine);
    });
    setPreferredId(readPreferredWishlistId());
    return () => {
      cancelled = true;
    };
  }, []);

  const shortcut = data ? pickShortcutWishlist(data, preferredId) : null;

  async function loadWishlists() {
    setLoading(true);
    try {
      // Charge en parallèle mes wishlists et celles qui contiennent déjà cette
      // carte, pour les afficher cochées à l'ouverture du popover.
      const [mine, containingRes] = await Promise.all([
        loadMyWishlists(),
        fetch(
          `/api/wishlists/mine/containing?gameSlug=${encodeURIComponent(gameSlug)}&cardId=${encodeURIComponent(cardId)}`
        ),
      ]);
      setData(mine);
      setLoaded(true);
      if (containingRes.ok) {
        const { wishlistIds }: { wishlistIds?: string[] } = await containingRes.json();
        if (Array.isArray(wishlistIds) && wishlistIds.length > 0) {
          setAddedIds((prev) => new Set([...prev, ...wishlistIds]));
        }
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
          image: printingChoice.image ?? image,
          ...(type !== undefined && { type }),
          ...(printingChoice.printingId !== undefined && {
            printingId: printingChoice.printingId,
            printingName: printingChoice.printingName,
          }),
          ...(printingChoice.foil && { foil: true }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || t("errors.addItem"));
        return;
      }
      // Ré-ajouter une carte déjà présente incrémente sa quantité : le toast
      // l'indique via la quantité renvoyée.
      const item: { quantity?: number } = await res.json().catch(() => ({}));
      setAddedIds((prev) => new Set(prev).add(wishlist.id));
      // La liste qu'on vient de choisir devient celle que le raccourci visera.
      writePreferredWishlistId(wishlist.id);
      setPreferredId(wishlist.id);
      if (typeof item.quantity === "number" && item.quantity > 1) {
        toast.success(
          t("addToWishlist.quantityIncreased", { wishlist: wishlist.name, quantity: item.quantity })
        );
      } else {
        toast.success(t("addToWishlist.added", { wishlist: wishlist.name }));
      }
      onAdded?.();
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
      invalidateMyWishlists();
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

  /**
   * Le raccourci : un geste au lieu de deux, vers la liste nommée sur le
   * bouton. Il ne remplace pas le panneau, qui reste le chemin dès qu'on veut
   * choisir — une autre liste, une variante d'impression.
   */
  const shortcutButton = shortcut ? (
    <Button
      type="button"
      variant={iconOnly ? undefined : "outline"}
      size={iconOnly ? undefined : "sm"}
      onClick={(e) => {
        e.stopPropagation();
        void handleAdd(shortcut);
      }}
      disabled={addingId === shortcut.id}
      aria-label={t("addToWishlist.quickAdd", { wishlist: shortcut.name })}
      title={t("addToWishlist.quickAdd", { wishlist: shortcut.name })}
      className={
        iconOnly
          ? "flex size-7 items-center justify-center rounded-full bg-black/60 p-0 text-white shadow transition-colors hover:bg-black/80"
          : "gap-1.5"
      }
    >
      {addingId === shortcut.id ? (
        <Loader2 className={iconOnly ? "size-3.5 animate-spin" : "size-4 animate-spin"} />
      ) : addedIds.has(shortcut.id) ? (
        <Check className={iconOnly ? "size-3.5" : "size-4 text-emerald-500"} />
      ) : (
        <Plus className={iconOnly ? "size-3.5" : "size-4"} />
      )}
      {!iconOnly && <span className="max-w-32 truncate">{shortcut.name}</span>}
    </Button>
  ) : null;

  return (
    // `flex-wrap` : deux boutons côte à côte, dont un au libellé libre — sans
    // repli, la rangée pousse la page hors de l'écran sur un téléphone.
    <span className="inline-flex flex-wrap items-center gap-1.5">
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {iconOnly ? (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={
              className ??
              (inWishlist
                ? "flex size-7 items-center justify-center rounded-full bg-rose-600 text-white shadow transition-colors hover:bg-rose-700"
                : "flex size-7 items-center justify-center rounded-full bg-black/60 text-white shadow transition-colors hover:bg-black/80")
            }
            aria-label={inWishlist ? t("addToWishlist.inWishlist") : t("addToWishlist.trigger")}
            title={inWishlist ? t("addToWishlist.inWishlist") : t("addToWishlist.trigger")}
          >
            <Heart className={inWishlist ? "size-3.5 fill-current" : "size-3.5"} />
          </button>
        ) : (
          <Button variant="outline" size="sm" className={className ?? "gap-1.5"}>
            <Heart className={inWishlist ? "size-4 fill-rose-500 text-rose-500" : "size-4"} />
            {t("addToWishlist.trigger")}
            {inWishlist && <span className="sr-only">{t("addToWishlist.inWishlist")}</span>}
          </Button>
        )}
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
                {printings && printings.length > 0 && (
                  <div className="border-b p-2">
                    <PrintingPicker
                      printings={printings}
                      value={printingId}
                      onChange={setPrintingId}
                      id={`wishlist-printing-${cardId}`}
                    />
                  </div>
                )}
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
    {shortcutButton}
    </span>
  );
}
