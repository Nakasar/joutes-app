"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  Layers,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Package,
  Sparkles,
  Boxes,
  Gamepad2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CollectionOverview as CollectionOverviewData, GameCollectionStats } from "@/lib/db/collection";

export function pct(owned: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((owned / total) * 1000) / 10);
}

export function CompletionBar({
  label,
  hint,
  owned,
  total,
  tone,
  icon,
}: {
  label: string;
  hint?: string;
  owned: number;
  total: number;
  tone: "master" | "game";
  icon: React.ReactNode;
}) {
  const value = pct(owned, total);
  const barColor = tone === "master" ? "bg-primary" : "bg-emerald-500";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          {icon}
          {label}
          {hint ? <span className="hidden text-xs font-normal text-muted-foreground sm:inline">· {hint}</span> : null}
        </span>
        <span className="tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{owned}</span> / {total}
          <span className="ml-1.5 tabular-nums">({value}%)</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-2xl font-bold tabular-nums leading-tight">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function GameCard({ game, basePath }: { game: GameCollectionStats; basePath: string }) {
  const t = useTranslations("Collection");
  const [showSets, setShowSets] = useState(false);
  const hasSets = game.sets.length > 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-3 border-b p-4">
        <div
          className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"
          style={game.color ? { backgroundColor: `${game.color}20` } : undefined}
        >
          {game.icon ? (
            <Image src={game.icon} alt={game.name} width={44} height={44} unoptimized className="size-11 object-contain" />
          ) : (
            <Gamepad2 className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-tight">{game.name}</h3>
          <p className="text-xs text-muted-foreground">
            {t("game.copies", { count: game.copies })}
            {hasSets ? ` · ${t("game.sets", { count: game.sets.length })}` : ""}
          </p>
        </div>
        <Button asChild size="sm" variant="secondary" className="shrink-0">
          <Link href={`${basePath}/${game.slug ?? game.gameId}`}>{t("game.open")}</Link>
        </Button>
      </div>

      <div className="space-y-3 p-4">
        <CompletionBar
          label={t("masterSet.label")}
          hint={t("masterSet.hint")}
          owned={game.masterOwned}
          total={game.masterTotal}
          tone="master"
          icon={<Layers className="size-4 text-primary" />}
        />
        <CompletionBar
          label={t("gameSet.label")}
          hint={t("gameSet.hint")}
          owned={game.gameOwned}
          total={game.gameTotal}
          tone="game"
          icon={<LayoutGrid className="size-4 text-emerald-500" />}
        />

        {hasSets ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-center gap-1 text-xs text-muted-foreground"
              onClick={() => setShowSets((v) => !v)}
            >
              {showSets ? t("game.hideSets") : t("game.showSets")}
              {showSets ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </Button>
            {showSets ? (
              <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                {game.sets.map((set) => (
                  <div key={set.setCode} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {set.setCode}
                      </Badge>
                    </div>
                    <CompletionBar
                      label={t("masterSet.short")}
                      owned={set.masterOwned}
                      total={set.masterTotal}
                      tone="master"
                      icon={<Layers className="size-3.5 text-primary" />}
                    />
                    <CompletionBar
                      label={t("gameSet.short")}
                      owned={set.gameOwned}
                      total={set.gameTotal}
                      tone="game"
                      icon={<LayoutGrid className="size-3.5 text-emerald-500" />}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

type CollectionOverviewProps = {
  initialOverview: CollectionOverviewData;
  /** Link prefix for per-game pages. Override for a play-group's collection. */
  basePath?: string;
  /** API prefix for reads. Override to view a play-group's shared collection instead of the current user's. */
  apiBasePath?: string;
  title?: string;
  subtitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
};

export default function CollectionOverview({
  initialOverview,
  basePath = "/collection",
  apiBasePath = "/api/collection",
  title,
  subtitle,
  emptyTitle,
  emptyDescription,
}: CollectionOverviewProps) {
  const t = useTranslations("Collection");
  const [overview, setOverview] = useState(initialOverview);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (withEmpty: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBasePath}?includeEmpty=${withEmpty}`);
      if (res.ok) {
        setOverview(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [apiBasePath]);

  // Refetch when the toggle changes (skip the very first render — SSR data is "owned only").
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!mounted) {
      setMounted(true);
      return;
    }
    void load(includeEmpty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeEmpty]);

  const hasAnyItems = initialOverview.games.some((g) => g.copies > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{title ?? t("title")}</h1>
        <p className="text-muted-foreground">{subtitle ?? t("subtitle")}</p>
      </div>

      {!hasAnyItems && !includeEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Boxes className="size-10 text-muted-foreground" />
          <div>
            <p className="font-semibold">{emptyTitle ?? t("empty.title")}</p>
            <p className="text-sm text-muted-foreground">{emptyDescription ?? t("empty.description")}</p>
          </div>
          <Button asChild>
            <Link href="/games">{t("empty.cta")}</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Overall stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={<Package className="size-5" />} value={overview.totalCopies} label={t("stats.copies")} />
            <StatTile icon={<Layers className="size-5" />} value={overview.masterOwned} label={t("stats.items")} />
            <StatTile
              icon={<Sparkles className="size-5" />}
              value={`${pct(overview.masterOwned, overview.masterTotal)}%`}
              label={t("stats.completion")}
            />
            <StatTile icon={<Gamepad2 className="size-5" />} value={overview.gamesWithItems} label={t("stats.games")} />
          </div>

          {/* Toggle */}
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setIncludeEmpty(false)}
                aria-pressed={!includeEmpty}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  !includeEmpty ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("toggle.owned")}
              </button>
              <button
                type="button"
                onClick={() => setIncludeEmpty(true)}
                aria-pressed={includeEmpty}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  includeEmpty ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("toggle.all")}
              </button>
            </div>
            {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>

          {/* Games grid */}
          {overview.games.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t("empty.noGames")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {overview.games.map((game) => (
                <GameCard key={game.gameId} game={game} basePath={basePath} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
