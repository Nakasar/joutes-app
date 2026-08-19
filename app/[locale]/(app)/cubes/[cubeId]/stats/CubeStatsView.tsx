"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation.ts";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, BarChart3, Boxes, Layers, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { CubeAttributeDistribution, CubeStats, CubeValueCount } from "@/lib/db/cube-stats.ts";
import type { Cube } from "@/lib/types/Cube.ts";

type Props = {
  cube: Cube;
  stats: CubeStats;
};

/** Teintes attribuées dans l'ordre d'affichage des valeurs. */
const SERIES_COLORS = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-indigo-500",
  "bg-lime-500",
  "bg-fuchsia-500",
];

/** Au-delà, les barres deviennent illisibles ; le reste est annoncé explicitement. */
const MAX_BARS = 12;

/** Barre segmentée : lecture d'un coup d'œil de la répartition d'un attribut. */
function StackedBar({ values, total, percent }: {
  values: CubeValueCount[];
  total: number;
  percent: Intl.NumberFormat;
}) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      {total > 0
        ? values.map((value, index) => (
            <div
              key={value.value}
              className={SERIES_COLORS[index % SERIES_COLORS.length]}
              style={{ width: `${(value.cards / total) * 100}%` }}
              title={`${value.value} · ${percent.format(value.cards / total)}`}
            />
          ))
        : null}
    </div>
  );
}

/**
 * Composant de module et non fonction interne au rendu : il porte l'état
 * « afficher toutes les valeurs », qu'un composant recréé à chaque rendu du
 * parent perdrait.
 */
function AttributeChart({ distribution }: { distribution: CubeAttributeDistribution }) {
  const t = useTranslations("Cubes");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);

  const integer = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

  const hidden = Math.max(0, distribution.values.length - MAX_BARS);
  const shown = expanded ? distribution.values : distribution.values.slice(0, MAX_BARS);
  const max = Math.max(...distribution.values.map((value) => value.cards), 1);
  const label = t.has(`stats.attributes.${distribution.key}`)
    ? t(`stats.attributes.${distribution.key}`)
    : distribution.key;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground">
          {t("stats.valueCount", { count: distribution.values.length })}
        </span>
        {distribution.multiValued ? (
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
            {t("stats.multiValued")}
          </Badge>
        ) : null}
      </div>

      {/* La barre empilée n'a de sens que si les parts s'additionnent : un
          attribut à valeurs multiples compte une carte plusieurs fois. */}
      {distribution.multiValued ? null : (
        <StackedBar values={shown} total={distribution.cardsWithValue} percent={percent} />
      )}

      <div className="space-y-1.5">
        {shown.map((value, index) => (
          <div key={value.value} className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 truncate" title={value.value}>{value.value}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${SERIES_COLORS[index % SERIES_COLORS.length]}`}
                style={{ width: `${(value.cards / max) * 100}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right tabular-nums">{integer.format(value.cards)}</span>
            <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
              {distribution.cardsWithValue > 0 ? percent.format(value.cards / distribution.cardsWithValue) : null}
            </span>
          </div>
        ))}
      </div>

      {hidden > 0 ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((previous) => !previous)}>
          {expanded ? t("stats.showLess") : t("stats.showMore", { count: hidden })}
        </Button>
      ) : null}

      {distribution.cardsWithoutValue > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("stats.cardsWithoutValue", { count: distribution.cardsWithoutValue })}
        </p>
      ) : null}
    </section>
  );
}

export default function CubeStatsView({ cube, stats }: Props) {
  const t = useTranslations("Cubes");
  const locale = useLocale();

  const integer = new Intl.NumberFormat(locale);
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const summary = [
    { icon: Layers, label: t("stats.packs"), value: integer.format(stats.packs) },
    { icon: Boxes, label: t("stats.cards"), value: integer.format(stats.cards) },
    { icon: Copy, label: t("stats.distinctCards"), value: integer.format(stats.distinctCards) },
    { icon: BarChart3, label: t("stats.cardsPerPack"), value: decimal.format(stats.cardsPerPack) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/cubes/${cube.id}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("backToCube", { name: cube.name })}
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("stats.title")}</h1>
          <p className="text-muted-foreground">{t("stats.subtitle", { name: cube.name })}</p>
        </div>
      </div>

      {stats.cards === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <BarChart3 className="size-10 text-muted-foreground" />
          <p className="font-semibold">{t("stats.emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("stats.emptyDescription")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summary.map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="size-4" />
                  {label}
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {stats.unknownCards > 0 ? (
            <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
              {t("stats.unknownCards", { count: stats.unknownCards })}
            </Badge>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{t("stats.rarityTitle")}</h2>
            {stats.rarity ? (
              <AttributeChart distribution={stats.rarity} />
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                {t("stats.noRarity")}
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{t("stats.attributesTitle")}</h2>
            {stats.attributes.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                {t("stats.noAttributes")}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {stats.attributes.map((distribution) => (
                  <AttributeChart key={distribution.key} distribution={distribution} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
