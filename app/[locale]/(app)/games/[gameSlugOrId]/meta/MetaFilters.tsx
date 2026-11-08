"use client";

import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/navigation.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { domainColor } from "@/lib/meta/domains.ts";
import { metaHref, type MetaPageState } from "@/lib/meta/page-params.ts";
import type { ResolvedMetaSettings } from "@/lib/meta/settings.ts";
import { cn } from "@/lib/utils.ts";

const ALL = "__all";

/** Période, source, légende et domaine : chaque choix change l'adresse, la page se recalcule. */
export function MetaFilters({
  basePath,
  state,
  settings,
  periods,
  sources,
  legends,
  domains,
}: {
  basePath: string;
  state: MetaPageState;
  settings: ResolvedMetaSettings;
  periods: number[];
  sources: { value: string; decks: number }[];
  legends: { value: string; label: string; decks: number }[];
  domains: string[];
}) {
  const t = useTranslations("Games.meta.filters");
  const router = useRouter();
  const go = (overrides: Partial<MetaPageState>) => router.push(metaHref(basePath, state, settings, overrides), { scroll: false });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={String(state.periodDays)} onValueChange={(value) => go({ periodDays: Number(value) })}>
        <SelectTrigger className="w-[11.5rem]" aria-label={t("period")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periods.map((days) => (
            <SelectItem key={days} value={String(days)}>
              {days === 0 ? t("allTime") : t("lastDays", { days })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {sources.length > 1 && (
        <Select value={state.source ?? ALL} onValueChange={(value) => go({ source: value === ALL ? undefined : value })}>
          <SelectTrigger className="w-[13rem] max-w-full" aria-label={t("source")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allSources", { count: sources.length })}</SelectItem>
            {sources.map((source) => (
              <SelectItem key={source.value} value={source.value}>
                {source.value} ({source.decks})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {legends.length > 1 && (
        <Select value={state.legend ?? ALL} onValueChange={(value) => go({ legend: value === ALL ? undefined : value })}>
          <SelectTrigger className="w-[13rem] max-w-full" aria-label={t("legend")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allLegends")}</SelectItem>
            {legends.map((legend) => (
              <SelectItem key={legend.value} value={legend.value}>
                {legend.label} ({legend.decks})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {domains.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("domain")}>
          {domains.map((domain) => {
            const active = state.domain === domain;
            return (
              <Link
                key={domain}
                href={metaHref(basePath, state, settings, { domain: active ? undefined : domain })}
                scroll={false}
                aria-pressed={active}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap",
                  active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                )}
              >
                <span className="size-2.5 rounded-full" style={{ background: domainColor(domain) }} aria-hidden />
                {domain}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
