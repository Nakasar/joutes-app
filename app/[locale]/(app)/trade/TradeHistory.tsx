"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Lock, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import type { PublicUser } from "@/lib/db/users.ts";
import type { Trade } from "@/lib/db/trades.ts";
import {
  DEFAULT_TRADE_HISTORY_SORT,
  TRADE_HISTORY_PAGE_SIZE,
  TRADE_HISTORY_WINDOW_DAYS,
  hasActiveHistoryFilters,
  type TradeHistorySort,
} from "@/lib/trade/history.ts";
import { PlanBadge } from "@/components/PlanBadge.tsx";
import { SUBSCRIPTION_PLANS, type SubscriptionPlanKey } from "@/lib/constants/subscription-plans.ts";
import { TradeRow, userLabel } from "./TradeRow.tsx";

/**
 * Le palier mis en avant auprès de qui n'est pas abonné : le moins cher qui
 * ouvre l'historique. Lu dans la table plutôt qu'écrit dans la traduction, pour
 * qu'un renommage de l'offre suive tout seul.
 */
const UNLOCKING_PLAN_LABEL = SUBSCRIPTION_PLANS.expert.label;

/** Valeur du menu déroulant pour « tous les partenaires » : `""` est refusé par Select. */
const ALL_PARTNERS = "__all__";

type Filters = {
  card: string;
  partner: string;
  from: string;
  to: string;
  sort: TradeHistorySort;
};

const EMPTY_FILTERS: Filters = {
  card: "",
  partner: "",
  from: "",
  to: "",
  sort: DEFAULT_TRADE_HISTORY_SORT,
};

/**
 * L'historique des échanges : la liste, ses filtres, sa pagination.
 *
 * Les filtres et l'historique au-delà de sept jours demandent
 * `trades:full_history` (Joutes Expert ou Joutes Pro). `canFilter` ne fait ici
 * que **refléter** cette règle — elle est appliquée par le serveur, dans
 * `resolveHistoryQuery`. Cacher les champs sans cela n'aurait rien protégé.
 *
 * La première page vient du rendu serveur : aucune requête au chargement, la
 * première n'a lieu qu'à la première interaction.
 */
export default function TradeHistory({
  initialItems,
  initialTotal,
  hiddenCount,
  partners,
  canFilter,
  unlockedByPlan,
  currentUserId,
}: {
  initialItems: Trade[];
  initialTotal: number;
  hiddenCount: number;
  partners: PublicUser[];
  canFilter: boolean;
  /** Le palier à créditer des filtres, ou `null` si aucun abonnement ne les ouvre. */
  unlockedByPlan: SubscriptionPlanKey | null;
  currentUserId: string;
}) {
  const t = useTranslations("Trade");

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(
    Math.max(1, Math.ceil(initialTotal / TRADE_HISTORY_PAGE_SIZE))
  );
  const [loading, setLoading] = useState(false);

  // Le rendu serveur tient déjà lieu de première page : sans ce garde, le
  // montage relancerait immédiatement la même requête.
  const untouched = useRef(true);
  // Une réponse tardive ne doit pas écraser une plus récente : la recherche par
  // nom de carte est saisie lettre à lettre, et les requêtes se doublent.
  const requestId = useRef(0);

  const { card, partner, from, to, sort } = filters;

  // Les dépendances sont les valeurs elles-mêmes, et non un `useCallback` qui
  // les enfermerait : `useTranslations` rend une fonction neuve à chaque rendu,
  // et un effet qui en dépendrait relancerait la requête que sa propre réponse
  // vient de provoquer.
  useEffect(() => {
    if (untouched.current) {
      untouched.current = false;
      return;
    }

    const id = ++requestId.current;

    // Le même délai que la recherche de cartes des panneaux d'échange : la
    // frappe ne déclenche pas une requête par lettre.
    const timer = setTimeout(async () => {
      setLoading(true);

      try {
        const params = new URLSearchParams({ page: String(page), sort });
        if (card.trim()) params.set("card", card.trim());
        if (partner) params.set("partner", partner);
        if (from) params.set("from", from);
        if (to) params.set("to", to);

        const res = await fetch(`/api/trades/history?${params.toString()}`);
        const data: { items?: Trade[]; total?: number; totalPages?: number } = await res
          .json()
          .catch(() => ({}));

        // Une réponse tardive ne doit pas écraser une plus récente.
        if (id !== requestId.current) return;

        if (!res.ok || !data.items) {
          toast.error(t("errors.failed"));
          return;
        }

        setItems(data.items);
        setTotal(data.total ?? data.items.length);
        setTotalPages(Math.max(1, data.totalPages ?? 1));
      } catch (error) {
        console.error("Failed to search the trade history:", error);
        if (id === requestId.current) toast.error(t("errors.failed"));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, partner, from, to, sort, page]);

  const updateFilters = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const filtered = hasActiveHistoryFilters(filters);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t("hub.historyTitle")}</h2>
        {!canFilter && (
          <p className="text-xs text-muted-foreground">
            {t("history.windowNote", { days: TRADE_HISTORY_WINDOW_DAYS })}
          </p>
        )}
      </div>

      {canFilter && (
        <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Dire d'où viennent ces filtres : sans cela, personne ne fait le
              lien entre son abonnement et ce qu'il lui apporte ici. Rien à
              afficher quand aucun palier ne les ouvre — un administrateur, ou
              une permission accordée à la main. */}
          {unlockedByPlan && (
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                <SlidersHorizontal className="size-4 text-muted-foreground" />
                {t("history.filters.title")}
              </span>
              <PlanBadge plan={unlockedByPlan} />
              <span className="text-xs text-muted-foreground">{t("history.filters.unlockedBy")}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="trade-history-card" className="text-xs font-medium text-muted-foreground">
              {t("history.filters.card")}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="trade-history-card"
                value={filters.card}
                onChange={(event) => updateFilters({ card: event.target.value })}
                placeholder={t("history.filters.cardPlaceholder")}
                className="pl-8"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("history.filters.partner")}
            </label>
            <Select
              value={filters.partner || ALL_PARTNERS}
              onValueChange={(value) =>
                updateFilters({ partner: value === ALL_PARTNERS ? "" : value })
              }
            >
              <SelectTrigger className="w-full" aria-label={t("history.filters.partner")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PARTNERS}>{t("history.filters.allPartners")}</SelectItem>
                {partners.map((candidate) => (
                  <SelectItem key={candidate.id} value={userLabel(candidate)}>
                    {userLabel(candidate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label htmlFor="trade-history-from" className="text-xs font-medium text-muted-foreground">
                {t("history.filters.from")}
              </label>
              <Input
                id="trade-history-from"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(event) => updateFilters({ from: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="trade-history-to" className="text-xs font-medium text-muted-foreground">
                {t("history.filters.to")}
              </label>
              <Input
                id="trade-history-to"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(event) => updateFilters({ to: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("history.filters.sort")}
            </label>
            <Select
              value={filters.sort}
              onValueChange={(value) => updateFilters({ sort: value as TradeHistorySort })}
            >
              <SelectTrigger className="w-full" aria-label={t("history.filters.sort")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">{t("history.filters.sortRecent")}</SelectItem>
                <SelectItem value="oldest">{t("history.filters.sortOldest")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered && (
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
              <p className="text-xs text-muted-foreground">{t("history.results", { count: total })}</p>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setPage(1);
                }}
              >
                <X className="size-3.5" />
                {t("history.filters.reset")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Le pendant du cadre de filtres pour qui n'y a pas droit : la
          fonctionnalité se montre, éteinte, plutôt que de ne pas exister. Le
          bouton reste cliquable et mène aux offres — l'affichage dit qu'il est
          verrouillé, il ne doit pas pour autant être un cul-de-sac. */}
      {!canFilter && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-muted/30 p-4">
          <Button
            asChild
            variant="outline"
            className="gap-2 text-muted-foreground"
          >
            <Link href="/pricing">
              <Lock className="size-4" />
              {t("history.locked.unlock", { plan: UNLOCKING_PLAN_LABEL })}
            </Link>
          </Button>
          {hiddenCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("history.locked.title", { count: hiddenCount })}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("history.loading")}
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {filtered ? t("history.noMatch") : t("hub.noHistory")}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((trade) => (
            <li key={trade.id}>
              <TradeRow trade={trade} currentUserId={currentUserId} />
            </li>
          ))}
        </ul>
      )}

      {/* La pagination vaut pour tout le monde : elle parcourt ce qui est déjà
          visible, elle n'ouvre rien de plus. */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft className="size-4" />
            {t("history.previous")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("history.page", { page, totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            {t("history.next")}
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

    </section>
  );
}
