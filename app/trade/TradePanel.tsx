"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Check, Loader2, Minus, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TradeCard, TradeCardScope, TradeCardSearchResult, TradeGame } from "@/lib/db/trades";

/** Une carte affichée dans un espace d'échange, avec son plafond de quantité. */
export type TradePanelCard = {
  key: string;
  cardId?: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  gameName?: string;
  quantity: number;
  /** Plafond du bouton « + » : exemplaires possédés connus, sinon la borne d'échange. */
  maxQuantity: number;
};

const ALL_GAMES = "all";

/**
 * Un des deux espaces de l'interface d'échange : les cartes retenues et, quand
 * l'espace est modifiable, la recherche permettant d'en ajouter (dans la
 * collection ou dans tout le catalogue).
 *
 * L'offre du partenaire est affichée avec le même composant en lecture seule.
 */
export default function TradePanel({
  title,
  subtitle,
  cards,
  emptyLabel,
  editable,
  requireOwned = false,
  requireCardId = false,
  defaultScope,
  games,
  disabled = false,
  refreshKey = 0,
  saving = false,
  badge,
  onAdd,
  onQuantityChange,
  onRemove,
}: {
  title: string;
  subtitle: string;
  cards: TradePanelCard[];
  emptyLabel: string;
  editable: boolean;
  /** Vrai pour sa propre offre : une carte non possédée n'est pas proposable. */
  requireOwned?: boolean;
  /** Vrai pour une contrepartie libre : la carte doit être connue du catalogue. */
  requireCardId?: boolean;
  defaultScope: TradeCardScope;
  games: TradeGame[];
  disabled?: boolean;
  /** Incrémenté après un échange pour relancer la recherche (les quantités possédées ont changé). */
  refreshKey?: number;
  saving?: boolean;
  badge?: ReactNode;
  onAdd?: (card: TradeCard) => void;
  onQuantityChange?: (key: string, quantity: number) => void;
  onRemove?: (key: string) => void;
}) {
  const t = useTranslations("Trade");

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<TradeCardScope>(defaultScope);
  const [gameId, setGameId] = useState(ALL_GAMES);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TradeCardSearchResult | null>(null);
  const [loading, setLoading] = useState(editable);

  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!editable) return;

    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ scope, page: String(page), limit: "12" });
        if (query.trim()) params.set("q", query.trim());
        if (gameId !== ALL_GAMES) params.set("gameId", gameId);

        const res = await fetch(`/api/trades/cards?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) return;
        const data: TradeCardSearchResult = await res.json();
        if (controller.signal.aborted) return;
        setResult(data);
      } catch (error) {
        if (!controller.signal.aborted) console.error("Failed to search cards:", error);
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setLoading(false);
        }
      }
    }, query.trim() ? 300 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, scope, gameId, page, refreshKey, editable]);

  // Tout changement de filtre repart de la première page.
  const updateQuery = (value: string) => {
    setQuery(value);
    setPage(1);
  };
  const updateScope = (value: TradeCardScope) => {
    setScope(value);
    setPage(1);
  };
  const updateGame = (value: string) => {
    setGameId(value);
    setPage(1);
  };

  const items = result?.items ?? [];
  const totalPages = result?.totalPages ?? 1;
  const cardsByKey = new Map(cards.map((card) => [card.key, card]));

  /** Une carte n'est ajoutable que si l'espace peut réellement l'accueillir. */
  const blockedReason = (card: TradeCard): string | null => {
    if (requireOwned && card.owned <= 0) return t("panel.notOwned");
    if (requireCardId && !card.cardId) return t("panel.notInCatalog");
    if (requireOwned && (cardsByKey.get(card.key)?.quantity ?? 0) >= card.owned) {
      return t("panel.allCopiesSelected");
    }
    return null;
  };

  const totalCopies = cards.reduce((sum, card) => sum + card.quantity, 0);

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          {badge}
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums">
            {t("panel.copies", { count: totalCopies })}
          </span>
        </div>
      </header>

      {/* Cartes retenues */}
      <div className="flex flex-col gap-2">
        {cards.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          cards.map((card) => (
            <div key={card.key} className="flex items-center gap-3 rounded-lg border bg-background p-2">
              <CardThumb image={card.image} name={card.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight" title={card.name}>
                  {card.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {card.setCode} #{card.collectorNumber}
                  {card.gameName ? ` · ${card.gameName}` : ""}
                </p>
              </div>
              {editable ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-7"
                    disabled={disabled || card.quantity <= 1}
                    onClick={() => onQuantityChange?.(card.key, card.quantity - 1)}
                    aria-label={t("panel.decrease", { name: card.name })}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{card.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-7"
                    disabled={disabled || card.quantity >= card.maxQuantity}
                    onClick={() => onQuantityChange?.(card.key, card.quantity + 1)}
                    aria-label={t("panel.increase", { name: card.name })}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    disabled={disabled}
                    onClick={() => onRemove?.(card.key)}
                    aria-label={t("panel.remove", { name: card.name })}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <span className="shrink-0 text-sm font-semibold tabular-nums">×{card.quantity}</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Recherche */}
      {editable ? (
        <div className="flex flex-col gap-2 border-t pt-4">
          <div className="inline-flex w-fit items-center rounded-lg border bg-muted/40 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => updateScope("collection")}
              aria-pressed={scope === "collection"}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                scope === "collection" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("panel.scopeCollection")}
            </button>
            <button
              type="button"
              onClick={() => updateScope("catalog")}
              aria-pressed={scope === "catalog"}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                scope === "catalog" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("panel.scopeCatalog")}
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder={t("panel.searchPlaceholder")}
                className="pl-9"
              />
            </div>
            {games.length > 0 ? (
              <Select value={gameId} onValueChange={updateGame}>
                <SelectTrigger className="sm:w-[170px]">
                  <SelectValue placeholder={t("panel.allGames")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_GAMES}>{t("panel.allGames")}</SelectItem>
                  {games.map((game) => (
                    <SelectItem key={game.id} value={game.id}>
                      {game.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <div className="flex min-h-5 items-center justify-between text-xs text-muted-foreground">
            <span>{result?.needsQuery ? null : t("panel.results", { count: result?.total ?? 0 })}</span>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          </div>

          {items.length === 0 && !loading ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              {result?.needsQuery
                ? t("panel.typeToSearch")
                : scope === "collection" && !query.trim() && gameId === ALL_GAMES
                  ? t("panel.emptyCollection")
                  : t("panel.noResults")}
            </p>
          ) : (
            <ul className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto">
              {items.map((card) => {
                const reason = blockedReason(card);
                const inSelection = cardsByKey.has(card.key);
                return (
                  <li key={`${card.key}|${card.cardId ?? ""}`} className="flex items-center gap-3 rounded-lg border p-2">
                    <CardThumb image={card.image} name={card.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-tight" title={card.name}>
                        {card.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {card.setCode} #{card.collectorNumber}
                        {card.gameName ? ` · ${card.gameName}` : ""}
                      </p>
                      {card.owned > 0 ? (
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {t("panel.owned", { count: card.owned })}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant={inSelection ? "secondary" : "outline"}
                      size="sm"
                      className="gap-1.5"
                      disabled={disabled || reason !== null}
                      title={reason ?? undefined}
                      onClick={() => onAdd?.(card)}
                    >
                      {inSelection ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                      {t("panel.add")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {t("panel.previous")}
              </Button>
              <span className="text-xs text-muted-foreground">{t("panel.pageOf", { page, totalPages })}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                {t("panel.next")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CardThumb({ image, name }: { image: string; name: string }) {
  if (!image) {
    return <div className="h-16 w-12 shrink-0 rounded bg-muted" aria-hidden />;
  }

  return (
    <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded bg-muted">
      <Image src={image} alt={name} fill unoptimized sizes="48px" className="object-cover" />
    </div>
  );
}
