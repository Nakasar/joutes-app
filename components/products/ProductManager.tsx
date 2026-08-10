"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { DateTime } from "luxon";
import { useTranslations } from "next-intl";
import {
  Boxes,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  PackageCheck,
  PackageOpen,
  Plus,
  Trash2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PAINT_STATE_KEYS, type PaintStateKey } from "@/lib/constants/paint-states";
import PaintStateBadge from "./PaintStateBadge";

const CURRENCIES = ["EUR", "USD", "GBP", "JPY", "CNY"] as const;

type ResolvedContent = {
  productId: string;
  quantity: number;
  name: string;
  image?: string;
  kind: string;
  owned: number;
};

type Completion = { owned: number; total: number; complete: boolean };

type Entry = {
  id: string;
  paintState?: PaintStateKey;
  sealed?: boolean;
  obtainedAt?: string;
  acquisitionPrice?: number;
  acquisitionCurrency?: string;
  fromProductEntryId?: string;
  box?: Completion;
  /** Ce que le retrait de cet exemplaire emporterait avec lui. */
  attachedCopies: number;
};

export type ProductDetail = {
  id: string;
  name: string;
  kind: string;
  setCode?: string;
  image?: string;
  contents: ResolvedContent[];
  content: Completion;
  quantity: number;
  entries: Entry[];
  containers: { id: string; name: string; image?: string; kind: string; owned: number }[];
};

/**
 * Gestion des exemplaires d'un produit.
 *
 * Le choix « j'ai la boîte » / « j'ai juste cette figurine » ne se pose jamais
 * en question bloquante : il se joue à l'endroit du clic. Ajouter depuis
 * l'en-tête ajoute le produit (avec son contenu, case cochée d'avance et
 * chiffrée) ; ajouter depuis une ligne du contenu n'ajoute que cette figurine.
 */
export default function ProductManager({
  gameSlug,
  productId,
  apiBasePath = "/api/collection",
  onChanged,
}: {
  gameSlug: string;
  productId: string;
  apiBasePath?: string;
  onChanged?: (quantity: number) => void;
}) {
  const t = useTranslations("Collection.products");

  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showEntries, setShowEntries] = useState(false);

  // Formulaire d'ajout
  const [paintState, setPaintState] = useState<PaintStateKey | "">("");
  const [sealed, setSealed] = useState(false);
  const [addContents, setAddContents] = useState(true);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [obtainedAt, setObtainedAt] = useState(() => DateTime.now().toISODate() ?? "");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<string>("EUR");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(
        `${apiBasePath}/games/${encodeURIComponent(gameSlug)}/products/${encodeURIComponent(productId)}`
      );
      if (!response.ok) throw new Error("failed");
      const data: ProductDetail = await response.json();
      setDetail(data);
      onChanged?.(data.quantity);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [apiBasePath, gameSlug, productId, onChanged]);

  useEffect(() => {
    void load();
  }, [load]);

  const isContainer = (detail?.contents.length ?? 0) > 0;

  const addOne = async (targetProductId: string, options?: { withContents?: boolean }) => {
    setBusy(true);
    try {
      const kept = detail?.contents
        .map((line) => line.productId)
        .filter((id) => !excluded.has(id));

      const response = await fetch(`${apiBasePath}/products?gameSlug=${encodeURIComponent(gameSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: targetProductId,
          ...(options?.withContents === false ? { addContents: false } : {}),
          ...(options?.withContents && kept && excluded.size > 0 ? { contents: kept } : {}),
          ...(paintState ? { paintState } : {}),
          ...(sealed ? { sealed: true } : {}),
          ...(obtainedAt ? { obtainedAt } : {}),
          ...(price ? { acquisitionPrice: Number(price), acquisitionCurrency: currency } : {}),
        }),
      });
      if (!response.ok) throw new Error("failed");
      await load();
      setShowAdd(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async (entryId: string, broughtCount: number) => {
    if (broughtCount > 0 && !confirm(t("copies.removeBoxWarning", { count: broughtCount }))) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${apiBasePath}/products/${encodeURIComponent(entryId)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("failed");
      await load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const patchEntry = async (entryId: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch(`${apiBasePath}/products/${encodeURIComponent(entryId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("failed");
      await load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !detail) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("copies.loading")}
      </p>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-center">
        <p className="text-sm text-muted-foreground">{t("empty.loadError")}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          {t("filters.retry")}
        </Button>
      </div>
    );
  }

  const keptCount = detail.contents
    .filter((line) => !excluded.has(line.productId))
    .reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{detail.quantity}</span>{" "}
          <span className="text-muted-foreground">{t("copies.owned", { count: detail.quantity })}</span>
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowAdd((open) => !open)}>
          <Plus className="size-4" />
          {t("add.trigger")}
          {showAdd ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </div>

      {showAdd && (
        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <Label className="mb-1.5 block text-xs">{t("add.paintState")}</Label>
            <div className="flex flex-wrap gap-1">
              {PAINT_STATE_KEYS.map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setPaintState((current) => (current === state ? "" : state))}
                  aria-pressed={paintState === state}
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    paintState === state ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}
                >
                  {t(`paintStates.${state}`)}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={sealed}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setSealed(next);
                // Une boîte encore scellée n'a rien livré : proposer d'en verser
                // le contenu serait se contredire. L'utilisateur peut recocher.
                if (next) setAddContents(false);
              }}
            />
            {t("add.sealed")}
          </label>

          {isContainer && (
            <div className="space-y-2 rounded-lg border border-dashed p-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={addContents}
                  onCheckedChange={(checked) => setAddContents(checked === true)}
                />
                {t("add.withContents", { count: keptCount })}
              </label>
              {addContents && (
                <>
                  <p className="text-xs text-muted-foreground">{t("add.withContentsHint")}</p>
                  <ul className="space-y-1">
                    {detail.contents.map((line) => (
                      <li key={line.productId} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={!excluded.has(line.productId)}
                          onCheckedChange={(checked) =>
                            setExcluded((prev) => {
                              const next = new Set(prev);
                              if (checked === true) next.delete(line.productId);
                              else next.add(line.productId);
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">{line.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          ×{line.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1.5 block text-xs">{t("add.obtainedAt")}</Label>
              <Input type="date" value={obtainedAt} onChange={(e) => setObtainedAt(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">{t("add.price")}</Label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="min-w-0"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <Button
            size="sm"
            disabled={busy}
            onClick={() => void addOne(detail.id, { withContents: isContainer && addContents })}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isContainer && addContents ? t("add.submitWithContents", { count: keptCount }) : t("add.submit")}
          </Button>
        </div>
      )}

      {detail.entries.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowEntries((open) => !open)}
            className="flex items-center gap-1 text-sm font-medium"
          >
            {t("copies.title")}
            {showEntries ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>

          {showEntries && (
            <ul className="space-y-2">
              {detail.entries.map((entry) => (
                <li key={entry.id} className="space-y-1.5 rounded-lg border p-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PaintStateBadge state={entry.paintState} sealed={entry.sealed} />
                    {entry.sealed && <Badge variant="outline">{t("copies.sealed")}</Badge>}
                    {entry.obtainedAt && (
                      <span className="text-xs text-muted-foreground">
                        {DateTime.fromISO(entry.obtainedAt).toLocaleString(DateTime.DATE_MED)}
                      </span>
                    )}
                    {entry.acquisitionPrice !== undefined && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {entry.acquisitionPrice} {entry.acquisitionCurrency ?? ""}
                      </span>
                    )}
                    {entry.box && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                          entry.box.complete ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted"
                        }`}
                        title={t("copies.boxHint")}
                      >
                        {entry.box.complete ? (
                          <PackageCheck className="size-3" />
                        ) : (
                          <PackageOpen className="size-3" />
                        )}
                        {entry.box.owned}/{entry.box.total}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {PAINT_STATE_KEYS.map((state) => (
                      <button
                        key={state}
                        type="button"
                        disabled={busy || entry.sealed}
                        onClick={() => void patchEntry(entry.id, { paintState: state })}
                        aria-pressed={entry.paintState === state}
                        title={entry.sealed ? t("copies.sealedLocked") : undefined}
                        className={`rounded-full border px-1.5 py-0.5 text-[10px] transition-colors disabled:opacity-40 ${
                          entry.paintState === state
                            ? "border-primary bg-primary/10 text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        {t(`paintStates.${state}`)}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {entry.sealed && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void patchEntry(entry.id, { sealed: false })}
                      >
                        {t("copies.unseal")}
                      </Button>
                    )}
                    {entry.fromProductEntryId && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void patchEntry(entry.id, { detach: true })}
                        title={t("copies.detachHint")}
                      >
                        <Unlink className="size-3.5" />
                        {t("copies.detach")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void removeEntry(entry.id, entry.attachedCopies)}
                      className="text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                      {t("copies.remove")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isContainer && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Boxes className="size-4 text-muted-foreground" />
            {t("contents.title")}
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {detail.content.owned}/{detail.content.total}
            </span>
          </p>
          <ul className="space-y-1">
            {detail.contents.map((line) => (
              <li key={line.productId} className="flex items-center gap-2 rounded-lg border p-1.5">
                {line.image ? (
                  <Image
                    src={line.image}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                    className="size-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                    <Package className="size-4 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{line.name}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {t("contents.required", { count: line.quantity })}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    line.owned >= line.quantity ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  }`}
                >
                  ×{line.owned}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="size-7 shrink-0"
                  disabled={busy}
                  onClick={() => void addOne(line.productId, { withContents: false })}
                  aria-label={t("contents.addOne", { name: line.name })}
                >
                  <Plus className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isContainer && detail.containers.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("contents.presentIn")}</p>
          <ul className="space-y-1">
            {detail.containers.map((container) => (
              <li key={container.id} className="flex items-center gap-2 rounded-lg border p-1.5 text-sm">
                {container.image ? (
                  <Image
                    src={container.image}
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                    className="size-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
                    <Boxes className="size-4 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{container.name}</span>
                {container.owned > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    ×{container.owned}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{t("empty.loadError")}</p>}
    </div>
  );
}
