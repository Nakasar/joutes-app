"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Boxes, Minus, Package, PackageCheck, PackageOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { suggestsRedundantPurchase, type ProductOwnership } from "@/lib/collection/product-ownership";

export type TileProduct = {
  id: string;
  name: string;
  kind: string;
  setCode?: string;
  edition?: string;
  image?: string;
  quantity: number;
  content: { owned: number; total: number; complete: boolean };
};

/**
 * Tuile d'un produit.
 *
 * Trois états se lisent d'un coup d'œil, et ils ne disent pas la même chose :
 *
 *  - **possédé** — anneau émeraude et pastille `×n`, comme une carte ;
 *  - **contenu partiel** — « 5/8 », ce qu'il reste à trouver ;
 *  - **contenu complet sans posséder le produit** — anneau ambre : tu as déjà
 *    toutes les figurines, cette boîte ne t'apporterait rien. C'est le seul cas
 *    où l'indicateur change une décision, et il ne s'allume que là.
 *
 * L'image est carrée, quand celle d'une carte est en 3/4 : une boîte n'est pas
 * une carte, et la différence de gabarit suffit à le dire.
 */
export default function ProductTile({
  product,
  kindLabel,
  editionLabel,
  onManage,
  onAdd,
  onRemove,
  busy = false,
}: {
  product: TileProduct;
  kindLabel: string;
  /**
   * Édition du produit, **seulement lorsqu'elle n'est pas celle en cours** :
   * une gamme qui traverse plusieurs éditions n'est pas toujours compatible
   * avec elle-même, et c'est l'exception qu'il faut signaler, pas la règle.
   */
  editionLabel?: string;
  onManage: () => void;
  onAdd?: () => void;
  onRemove?: () => void;
  busy?: boolean;
}) {
  const t = useTranslations("Collection.products");

  const owned = product.quantity > 0;
  const ownership: ProductOwnership = {
    copies: product.quantity,
    owned: product.content.owned,
    total: product.content.total,
    complete: product.content.complete,
  };
  const redundant = suggestsRedundantPurchase(ownership);
  const isContainer = product.content.total > 0;

  const ring = owned
    ? "ring-1 ring-emerald-500/40"
    : redundant
      ? "ring-1 ring-amber-500/50"
      : "";

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md ${ring}`}
    >
      <button
        type="button"
        onClick={onManage}
        className="relative block aspect-square w-full overflow-hidden bg-muted"
        aria-label={t("tile.manage", { name: product.name })}
      >
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            unoptimized
            sizes="(max-width: 640px) 45vw, (max-width: 1280px) 20vw, 200px"
            className={`object-cover transition-transform group-hover:scale-[1.03] ${
              owned ? "" : "opacity-60 grayscale-[35%]"
            }`}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            {isContainer ? (
              <Boxes className="size-10 text-muted-foreground" />
            ) : (
              <Package className="size-10 text-muted-foreground" />
            )}
          </span>
        )}

        {owned ? (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white shadow tabular-nums">
            ×{product.quantity}
          </span>
        ) : null}

        {isContainer ? (
          <span
            className={`absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold shadow tabular-nums ${
              product.content.complete
                ? "bg-emerald-500 text-white"
                : "bg-background/85 text-foreground"
            }`}
            title={
              product.content.complete
                ? redundant
                  ? t("tile.contentCompleteHint")
                  : t("tile.contentComplete")
                : t("tile.contentPartialHint")
            }
          >
            {product.content.complete ? (
              <PackageCheck className="size-3" />
            ) : (
              <PackageOpen className="size-3" />
            )}
            {product.content.owned}/{product.content.total}
          </span>
        ) : null}
      </button>

      <span className="absolute left-1.5 top-1.5 z-10 rounded-full border bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow">
        {kindLabel}
      </span>

      {editionLabel ? (
        <span
          className="absolute left-1.5 top-7 z-10 rounded-full border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 shadow dark:text-amber-200"
          title={editionLabel}
        >
          {editionLabel}
        </span>
      ) : null}

      <div className="flex flex-1 flex-col gap-2 p-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight" title={product.name}>
            {product.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {product.setCode ? `${product.setCode} · ` : ""}
            {kindLabel}
          </p>
        </div>

        {onAdd && onRemove ? (
          <div className="mt-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              className="size-7"
              disabled={!owned || busy}
              onClick={onRemove}
              aria-label={t("tile.removeOne")}
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="flex-1 text-center text-sm tabular-nums">{product.quantity}</span>
            <Button
              variant="outline"
              size="icon-sm"
              className="size-7"
              disabled={busy}
              onClick={onAdd}
              aria-label={t("tile.addOne")}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
