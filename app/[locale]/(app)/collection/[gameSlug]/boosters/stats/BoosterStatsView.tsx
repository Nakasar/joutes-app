"use client";

import { Link } from "@/i18n/navigation.ts";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, BarChart3, Package, Sparkles, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import type { BoosterGroupStats, BoosterStats, RarityCount } from "@/lib/db/booster-stats.ts";
import { useBoosterTypeLabel } from "../useBoosterTypeLabel.ts";

type Props = {
  gameSlug: string;
  gameName: string;
  stats: BoosterStats;
};

/** Teintes des raretés, attribuées dans l'ordre d'affichage (de la plus fréquente à la plus rare). */
const RARITY_COLORS = [
  "bg-slate-400",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-orange-500",
];
const UNKNOWN_RARITY_COLOR = "bg-muted-foreground/40";

function rarityColor(rarities: string[], rarity: string): string {
  const index = rarities.indexOf(rarity);
  return index >= 0 ? RARITY_COLORS[index % RARITY_COLORS.length] : UNKNOWN_RARITY_COLOR;
}

export default function BoosterStatsView({ gameSlug, gameName, stats }: Props) {
  const t = useTranslations("Collection");
  const locale = useLocale();
  const boosterTypeLabel = useBoosterTypeLabel();

  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const integer = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

  const summary = [
    { icon: Package, label: t("boosters.stats.boosters"), value: integer.format(stats.boosters) },
    { icon: Layers, label: t("boosters.stats.cards"), value: integer.format(stats.cards) },
    { icon: BarChart3, label: t("boosters.stats.cardsPerBooster"), value: decimal.format(stats.cardsPerBooster) },
    {
      icon: Sparkles,
      label: t("boosters.stats.foils"),
      value: integer.format(stats.foils),
      hint: stats.cards > 0 ? percent.format(stats.foils / stats.cards) : undefined,
    },
  ];

  /** Barre segmentée d'une distribution de raretés, sur les seules cartes de rareté connue. */
  const RarityBar = ({ counts, total }: { counts: RarityCount[]; total: number }) => (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      {total > 0
        ? counts.map((count) => (
            <div
              key={count.rarity}
              className={rarityColor(stats.rarities, count.rarity)}
              style={{ width: `${(count.cards / total) * 100}%` }}
              title={`${count.rarity} · ${percent.format(count.cards / total)}`}
            />
          ))
        : null}
    </div>
  );

  const GroupTable = ({ title, columnLabel, groups, labelOf }: {
    title: string;
    columnLabel: string;
    groups: BoosterGroupStats[];
    labelOf: (key: string) => string;
  }) => (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{columnLabel}</th>
              <th className="px-3 py-2 text-right font-medium">{t("boosters.stats.boosters")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("boosters.stats.cards")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("boosters.stats.perBoosterShort")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("boosters.stats.rarityDistribution")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {groups.map((group) => (
              <tr key={group.key} className="align-top">
                <td className="px-3 py-2 font-medium">{labelOf(group.key)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{integer.format(group.boosters)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{integer.format(group.cards)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{decimal.format(group.cardsPerBooster)}</td>
                <td className="px-3 py-2">
                  {group.cards === 0 ? (
                    <span className="text-xs text-muted-foreground">{t("boosters.stats.noCards")}</span>
                  ) : (
                    <div className="space-y-1.5">
                      <RarityBar counts={group.rarities} total={group.knownCards} />
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {group.rarities.map((count) => (
                          <span key={count.rarity} className="inline-flex items-center gap-1">
                            <span className={`size-2 rounded-full ${rarityColor(stats.rarities, count.rarity)}`} />
                            {count.rarity}
                            <span className="tabular-nums text-foreground">
                              {t("boosters.stats.perBooster", {
                                rate: decimal.format(group.boosters > 0 ? count.cards / group.boosters : 0),
                              })}
                            </span>
                            {/* Part calculée sur les cartes de rareté connue, cohérente avec leur exclusion des taux. */}
                            <span className="tabular-nums">({percent.format(count.cards / group.knownCards)})</span>
                          </span>
                        ))}
                        {group.cardsWithoutRarity > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <span className={`size-2 rounded-full ${UNKNOWN_RARITY_COLOR}`} />
                            {t("boosters.stats.cardsWithoutRarity", { count: group.cardsWithoutRarity })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/collection/${gameSlug}/boosters`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("boosters.backToList")}
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("boosters.stats.title")}</h1>
          <p className="text-muted-foreground">{t("boosters.stats.subtitle", { game: gameName })}</p>
        </div>
      </div>

      {stats.boosters === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <BarChart3 className="size-10 text-muted-foreground" />
          <p className="font-semibold">{t("boosters.stats.emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("boosters.stats.emptyDescription")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summary.map(({ icon: Icon, label, value, hint }) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="size-4" />
                  {label}
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
                {hint ? <p className="text-xs text-muted-foreground tabular-nums">{hint}</p> : null}
              </div>
            ))}
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{t("boosters.stats.overallTitle")}</h2>
            {stats.knownCards === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                {stats.cards === 0 ? t("boosters.stats.noCards") : t("boosters.stats.noKnownRarity")}
              </p>
            ) : (
              <div className="space-y-3 rounded-xl border bg-card p-4">
                <RarityBar counts={stats.overall} total={stats.knownCards} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.overall.map((count) => (
                    <div key={count.rarity} className="flex items-center justify-between gap-3 text-sm">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className={`size-2.5 shrink-0 rounded-full ${rarityColor(stats.rarities, count.rarity)}`} />
                        <span className="truncate">{count.rarity}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {t("boosters.stats.perBooster", {
                          rate: decimal.format(stats.boosters > 0 ? count.cards / stats.boosters : 0),
                        })}
                        {" · "}
                        {/* Part des cartes de rareté connue : les autres sont annoncées à part. */}
                        {percent.format(count.cards / stats.knownCards)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {stats.cardsWithoutRarity > 0 ? (
              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                {t("boosters.stats.cardsWithoutRarity", { count: stats.cardsWithoutRarity })}
              </Badge>
            ) : null}
          </section>

          <GroupTable
            title={t("boosters.stats.byTypeTitle")}
            columnLabel={t("boosters.type")}
            groups={stats.byType}
            labelOf={boosterTypeLabel}
          />

          <GroupTable
            title={t("boosters.stats.bySetTitle")}
            columnLabel={t("boosters.set")}
            groups={stats.bySet}
            labelOf={(key) => key}
          />
        </>
      )}
    </div>
  );
}
