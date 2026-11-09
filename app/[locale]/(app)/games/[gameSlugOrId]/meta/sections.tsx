import type { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { DateTime } from "luxon";

import { getPathname, Link } from "@/i18n/navigation.ts";
import { COLORLESS_COLOR, domainColor } from "@/lib/meta/domains.ts";
import { metaHref, thresholdChoices, thresholdPercent, type MetaPageState } from "@/lib/meta/page-params.ts";
import type { ResolvedMetaSettings } from "@/lib/meta/settings.ts";
import {
  COLORLESS,
  isTopCut,
  legendLabel,
  type CardAssociations,
  type MetaCardStat,
  type MetaOverview,
  type MetaSample,
  type MetaSampleDeck,
  type SetStat,
  type StapleGroup,
  type StapleSettings,
} from "@/lib/meta/stats.ts";
import { cn } from "@/lib/utils.ts";

export type MetaView = {
  t: Awaited<ReturnType<typeof getTranslations>>;
  locale: string;
  basePath: string;
  state: MetaPageState;
  settings: ResolvedMetaSettings;
  sample: MetaSample;
  /** Les decks filtrés. */
  decks: MetaSampleDeck[];
  stats: MetaCardStat[];
  stapleSettings: StapleSettings;
  stapleNames: Set<string>;
  catalogTotal: number;
  /** Écart de part des decks, 30 derniers jours contre les 30 d'avant ; null sans assez de decks. */
  trends: Map<string, number> | null;
};

const CARDS_PER_PAGE = 50;
const DECKS_PER_PAGE = 30;

function formatters(locale: string) {
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return { pct: (value: number) => percent.format(value), dec: (value: number) => decimal.format(value) };
}

function href(view: MetaView, overrides: Partial<MetaPageState>) {
  return metaHref(view.basePath, view.state, view.settings, overrides);
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-2xl border border-border bg-card", className)}>{children}</section>;
}

function DomainDots({ domains }: { domains: string[] }) {
  return (
    <span className="inline-flex shrink-0 gap-1" aria-label={domains.join(", ") || COLORLESS}>
      {(domains.length > 0 ? domains : [COLORLESS]).map((domain) => (
        <span
          key={domain}
          className="size-2 rounded-full"
          style={{ background: domain === COLORLESS ? COLORLESS_COLOR : domainColor(domain) }}
        />
      ))}
    </span>
  );
}

function StapleBadge({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-md bg-amber-400 px-1.5 py-px text-[10px] font-bold tracking-wide text-amber-950 uppercase">
      {label}
    </span>
  );
}

function Bar({ value, color, marker }: { value: number; color?: string; marker?: number }) {
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, ...(color ? { background: color } : {}) }}
      />
      {marker !== undefined && (
        <div
          className="absolute top-0 h-full w-0.5 bg-foreground/70"
          style={{ left: `calc(${Math.min(100, Math.max(0, marker * 100))}% - 1px)` }}
          aria-hidden
        />
      )}
    </div>
  );
}

function Thumb({ src, className }: { src?: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={cn("shrink-0 rounded object-cover", className)} />
  ) : (
    <div className={cn("shrink-0 rounded bg-muted", className)} aria-hidden />
  );
}

function Kpi({ label, value, hint, href: link, accent }: { label: string; value: string; hint: string; href?: string; accent?: boolean }) {
  const body = (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-3xl font-bold tracking-tight", accent && "text-amber-600 dark:text-amber-400")}>{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </>
  );
  const className = "flex flex-col gap-1 rounded-2xl border border-border bg-card p-4";
  return link ? (
    <Link href={link} scroll={false} className={cn(className, "hover:bg-muted/50")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Les colonnes du tableau des cartes, avec ou sans la tendance. */
function cardColumns(view: MetaView) {
  return view.trends
    ? "sm:grid-cols-[2rem_minmax(0,1fr)_4.5rem_7rem_9rem_5rem_5rem]"
    : "sm:grid-cols-[2rem_minmax(0,1fr)_4.5rem_7rem_9rem_5rem]";
}

/** La tendance en points : « +9 pts », « −4 pts », « = » sous un point d'écart, « — » sans decks récents. */
function Trend({ view, value, className }: { view: MetaView; value: number | undefined; className?: string }) {
  const points = value === undefined ? undefined : Math.round(value * 100);
  const label =
    points === undefined
      ? "—"
      : points === 0
        ? "="
        : view.t("trend.points", { points: `${points > 0 ? "+" : "−"}${Math.abs(points)}` });
  return (
    <span
      className={cn(
        "font-mono text-sm",
        points && points > 0
          ? "text-emerald-600 dark:text-emerald-400"
          : points && points < 0
            ? "text-red-600 dark:text-red-400"
            : "text-muted-foreground",
        className
      )}
      title={view.t("trend.hint")}
    >
      {label}
    </span>
  );
}

/** Une ligne du tableau des cartes : vignette, nom, badge staple, parts, exemplaires et tendance. */
function CardRow({ view, stat, rank }: { view: MetaView; stat: MetaCardStat; rank?: number }) {
  const { t } = view;
  const { pct, dec } = formatters(view.locale);
  const staple = view.stapleNames.has(stat.name);
  const domainLabel = stat.domains.length > 0 ? stat.domains.join(" + ") : COLORLESS;

  return (
    <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:px-5", cardColumns(view))}>
      {rank !== undefined && <span className="hidden font-mono text-xs text-muted-foreground sm:block">{rank}</span>}
      <Link
        href={href(view, { tab: "together", card: stat.name })}
        className={cn("flex min-w-0 items-center gap-3", rank === undefined && "sm:col-span-2")}
      >
        <Thumb src={stat.image} className="h-10 w-7" />
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium hover:underline">{stat.name}</span>
            {staple && <StapleBadge label={t("staple")} />}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
            <DomainDots domains={stat.domains} />
            {t("inDomainShort", { share: pct(stat.domainShare), domain: domainLabel })}
          </span>
        </span>
      </Link>
      <span className="hidden font-mono text-xs text-muted-foreground sm:block">{stat.setCode ?? "—"}</span>
      <span className="flex flex-col items-end sm:block sm:text-left">
        <span className="font-mono text-sm">{pct(stat.share)}</span>
        <span className="ml-1.5 hidden text-xs text-muted-foreground sm:inline">{stat.decks}</span>
        {view.trends && <Trend view={view} value={view.trends.get(stat.name)} className="text-xs sm:hidden" />}
      </span>
      <span className="hidden items-center gap-1.5 text-sm sm:flex">
        <DomainDots domains={stat.domains} />
        <span className="font-mono">{pct(stat.domainShare)}</span>
        <span className="truncate text-xs text-muted-foreground">{domainLabel}</span>
      </span>
      <span className="hidden font-mono text-sm sm:block">{dec(stat.averageCopies)}</span>
      {view.trends && <Trend view={view} value={view.trends.get(stat.name)} className="hidden sm:block" />}
    </li>
  );
}

function CardTableHeader({ view, rank = true }: { view: MetaView; rank?: boolean }) {
  const { t } = view;
  return (
    <div className={cn("hidden gap-x-3 border-b border-border px-5 py-2 text-xs text-muted-foreground sm:grid", cardColumns(view))}>
      {rank ? <span>#</span> : <span />}
      <span>{t("columns.card")}</span>
      <span>{t("columns.set")}</span>
      <span>{t("columns.inDecks")}</span>
      <span>{t("columns.inDomain")}</span>
      <span>{t("columns.copies")}</span>
      {view.trends && <span>{t("columns.trend")}</span>}
    </div>
  );
}

export function OverviewTab({ view, overview }: { view: MetaView; overview: MetaOverview }) {
  const { t } = view;
  const { pct } = formatters(view.locale);
  const maxLegend = overview.legends[0]?.share ?? 1;
  const maxDomain = overview.domains[0]?.share ?? 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("kpi.decks")} value={String(overview.decks)} hint={t("kpi.decksHint", { count: overview.sources })} />
        <Kpi
          label={t("kpi.legends")}
          value={String(overview.legends.length)}
          hint={t("kpi.legendsHint", { share: pct(overview.topLegendsShare), count: Math.min(8, overview.legends.length) })}
        />
        <Kpi
          label={t("kpi.cards")}
          value={String(overview.cardsPlayed)}
          hint={view.catalogTotal > 0 ? t("kpi.cardsHint", { total: view.catalogTotal }) : t("kpi.cardsHintNoTotal")}
        />
        <Kpi
          label={t("kpi.staples")}
          value={String(view.stapleNames.size)}
          hint={t("kpi.staplesHint", { threshold: pct(view.state.threshold) })}
          href={href(view, { tab: "staples" })}
          accent
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="flex flex-col gap-3 p-4 sm:p-5 lg:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">{t("overview.legends")}</h2>
            <span className="text-xs text-muted-foreground">{t("overview.legendsHint")}</span>
          </div>
          <ul className="flex flex-col gap-3">
            {overview.legends.slice(0, 8).map((legend) => (
              <li key={legend.key}>
                <Link
                  href={href(view, { legend: legend.key })}
                  scroll={false}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_3.5rem_5.5rem]"
                >
                  <Thumb src={legend.image} className="h-14 w-10" />
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold hover:underline">{legend.name}</span>
                      <DomainDots domains={legend.domains} />
                    </span>
                    <Bar value={legend.share / maxLegend} />
                  </span>
                  <span className="text-right font-mono text-sm">{pct(legend.share)}</span>
                  <span className="hidden text-right text-xs text-muted-foreground sm:block">
                    {t("overview.topCuts", { count: legend.topCuts })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="flex flex-col gap-3 p-4 sm:p-5 lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">{t("overview.domains")}</h2>
            <span className="text-xs text-muted-foreground">{t("overview.domainsHint")}</span>
          </div>
          <ul className="flex flex-col gap-3">
            {overview.domains.map((domain) => (
              <li key={domain.domain} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: domainColor(domain.domain) }} aria-hidden />
                  {domain.domain}
                </span>
                <Bar value={domain.share / maxDomain} color={domainColor(domain.domain)} />
                <span className="text-right font-mono text-sm">{pct(domain.share)}</span>
              </li>
            ))}
          </ul>
          {overview.topPair && (
            <p className="border-t border-border pt-3 text-sm text-muted-foreground">
              {t.rich("overview.topPair", {
                pair: overview.topPair.domains.join(" + "),
                share: pct(overview.topPair.share),
                strong: (chunks) => <span className="text-foreground">{chunks}</span>,
              })}
            </p>
          )}
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold">{t("overview.topCards")}</h2>
          <Link href={href(view, { tab: "cards" })} scroll={false} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            {t("overview.allCards", { count: view.stats.length })}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <CardTableHeader view={view} />
        <ul className="divide-y divide-border">
          {view.stats.slice(0, 10).map((stat, index) => (
            <CardRow key={stat.name} view={view} stat={stat} rank={index + 1} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export function CardsTab({ view }: { view: MetaView }) {
  const { t } = view;
  const types = [...new Set(view.stats.map((stat) => stat.type).filter((type): type is string => Boolean(type)))].sort();
  const filtered = view.state.type ? view.stats.filter((stat) => stat.type === view.state.type) : view.stats;
  const totalPages = Math.max(1, Math.ceil(filtered.length / CARDS_PER_PAGE));
  const page = Math.min(view.state.page, totalPages);
  const start = (page - 1) * CARDS_PER_PAGE;

  return (
    <div className="flex flex-col gap-4">
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("columns.type")}>
          {[undefined, ...types].map((type) => (
            <Link
              key={type ?? "all"}
              href={href(view, { type })}
              scroll={false}
              aria-pressed={view.state.type === type}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 text-sm whitespace-nowrap",
                view.state.type === type ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
              )}
            >
              {type ?? t("allTypes")}
            </Link>
          ))}
        </div>
      )}

      <Panel className="overflow-hidden">
        <CardTableHeader view={view} />
        <ul className="divide-y divide-border">
          {filtered.slice(start, start + CARDS_PER_PAGE).map((stat, index) => (
            <CardRow key={stat.name} view={view} stat={stat} rank={start + index + 1} />
          ))}
        </ul>
      </Panel>

      <Pagination view={view} page={page} totalPages={totalPages} total={filtered.length} unit="cards" />
    </div>
  );
}

function Pagination({
  view,
  page,
  totalPages,
  total,
  unit,
}: {
  view: MetaView;
  page: number;
  totalPages: number;
  total: number;
  unit: "cards" | "decks";
}) {
  const { t } = view;
  if (totalPages <= 1) return null;
  const linkClass = "inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted";
  return (
    <nav aria-label={t("pagination.label")} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{t(`pagination.${unit}`, { page, totalPages, total })}</span>
      <div className="flex flex-wrap gap-2">
        {page > 1 && (
          <Link href={href(view, { page: page - 1 })} className={linkClass}>
            {t("pagination.previous")}
          </Link>
        )}
        {page < totalPages && (
          <Link href={href(view, { page: page + 1 })} className={linkClass}>
            {t("pagination.next")}
          </Link>
        )}
      </div>
    </nav>
  );
}

export function StaplesTab({ view, groups }: { view: MetaView; groups: StapleGroup[] }) {
  const { t } = view;
  const { pct, dec } = formatters(view.locale);
  const thresholds = thresholdChoices(view.settings);

  return (
    <div className="flex flex-col gap-5">
      <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{t("staples.title", { count: view.stapleNames.size })}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t("staples.explain", { threshold: pct(view.state.threshold), minDecks: view.settings.minDecksPerDomain })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5" role="group" aria-label={t("staples.threshold")}>
          <span className="mr-1 text-sm text-muted-foreground">{t("staples.threshold")}</span>
          {thresholds.map((value) => {
            const active = thresholdPercent(view.state.threshold) === value;
            return (
              <Link
                key={value}
                href={href(view, { threshold: value / 100 })}
                scroll={false}
                aria-pressed={active}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full border px-3 font-mono text-sm",
                  active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                )}
              >
                {value} %
              </Link>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <Panel key={group.key} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold">
                <DomainDots domains={group.domains} />
                {group.key}
              </h3>
              <span className="text-right text-xs text-muted-foreground">
                {t("staples.groupHint", { decks: group.decks, count: group.staples.length })}
              </span>
            </div>
            {group.tooFew ? (
              <p className="text-sm text-muted-foreground">{t("staples.tooFew", { minDecks: view.settings.minDecksPerDomain })}</p>
            ) : group.staples.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("staples.none")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {group.staples.map((stat) => (
                  <li key={stat.name}>
                    <Link href={href(view, { tab: "together", card: stat.name })} className="flex items-center gap-3">
                      <span className="w-10 shrink-0 text-right font-mono text-sm text-amber-700 dark:text-amber-400">
                        {pct(stat.domainShare)}
                      </span>
                      <Thumb src={stat.image} className="h-10 w-7" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium hover:underline">{stat.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {t("staples.cardHint", { set: stat.setCode ?? "—", copies: dec(stat.averageCopies) })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {group.nearMisses.length > 0 && (
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-xs text-muted-foreground">{t("staples.nearMisses")}</p>
                <ul className="flex flex-col gap-0.5">
                  {group.nearMisses.map((stat) => (
                    <li key={stat.name} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={href(view, { tab: "together", card: stat.name })} className="truncate hover:underline">
                        {stat.name}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">{pct(stat.domainShare)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}

export function TogetherTab({
  view,
  associations,
  requested,
}: {
  view: MetaView;
  associations: CardAssociations | null;
  requested?: string;
}) {
  const { t } = view;
  const { pct, dec } = formatters(view.locale);
  const card = associations?.card;

  return (
    <div className="flex flex-col gap-5">
      {/* Les champs cachés reprennent l'adresse de la vue (filtres, seuil), et l'action garde la langue. */}
      <form action={getPathname({ href: view.basePath, locale: view.locale })} className="flex flex-wrap items-center gap-2">
        {[...new URLSearchParams(href(view, { tab: "together", card: undefined }).split("?")[1] ?? "")].map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label htmlFor="meta-card" className="sr-only">
          {t("together.pick")}
        </label>
        <input
          id="meta-card"
          name="card"
          list="meta-card-names"
          defaultValue={card?.name ?? requested ?? ""}
          placeholder={t("together.pick")}
          className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm sm:w-80"
        />
        <datalist id="meta-card-names">
          {view.stats.map((stat) => (
            <option key={stat.name} value={stat.name} />
          ))}
        </datalist>
        <button type="submit" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          {t("together.show")}
        </button>
      </form>

      {!associations || !card ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-muted-foreground">
          {t("together.notFound", { name: requested ?? "" })}
        </p>
      ) : (
        <>
          <Panel className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="flex min-w-0 items-center gap-4">
              <Thumb src={card.image} className="h-24 w-[4.3rem]" />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xl font-bold">{card.name}</span>
                  {view.stapleNames.has(card.name) && <StapleBadge label={t("staple")} />}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <DomainDots domains={card.domains} />
                  {[card.domains.join(" · ") || COLORLESS, card.type, card.setCode].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:ml-auto sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">{t("together.inDecks")}</dt>
                <dd className="font-mono">
                  {card.decks} · {pct(card.share)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("together.inDomain")}</dt>
                <dd className="font-mono">{pct(card.domainShare)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("together.copies")}</dt>
                <dd className="font-mono">{dec(card.averageCopies)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("together.with")}</dt>
                <dd className="truncate">{associations.legends.map((legend) => `${legend.name} ${pct(legend.share)}`).join(" · ")}</dd>
              </div>
            </dl>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="overflow-hidden lg:col-span-2">
              <div className="flex flex-col gap-1 px-4 py-3 sm:px-5">
                <h2 className="text-base font-semibold">{t("together.often", { name: card.name })}</h2>
                <p className="text-xs text-muted-foreground">{t("together.oftenHint", { count: card.decks })}</p>
              </div>
              {associations.often.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">{t("together.noneOften")}</p>
              ) : (
                <>
                  <div className="hidden grid-cols-[minmax(0,1fr)_8rem_4rem_4rem] gap-x-3 border-y border-border px-5 py-2 text-xs text-muted-foreground sm:grid">
                    <span>{t("columns.card")}</span>
                    <span>{t("together.withCard")}</span>
                    <span>{t("together.usually")}</span>
                    <span>{t("together.lift")}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {associations.often.map((item) => (
                      <li
                        key={item.name}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_4rem_4rem] sm:px-5"
                      >
                        <Link href={href(view, { tab: "together", card: item.name })} className="flex min-w-0 items-center gap-3">
                          <Thumb src={item.image} className="h-10 w-7" />
                          <span className="truncate text-sm font-medium hover:underline">{item.name}</span>
                        </Link>
                        <span className="font-mono text-sm text-emerald-700 sm:hidden dark:text-emerald-400">×{dec(item.lift)}</span>
                        <span className="col-span-2 flex items-center gap-2 sm:col-span-1">
                          <span className="w-10 font-mono text-sm">{pct(item.withShare)}</span>
                          <span className="flex-1">
                            <Bar value={item.withShare} marker={item.baseShare} />
                          </span>
                        </span>
                        <span className="hidden font-mono text-sm text-muted-foreground sm:block">{pct(item.baseShare)}</span>
                        <span className="hidden font-mono text-sm text-emerald-700 sm:block dark:text-emerald-400">×{dec(item.lift)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="border-t border-border px-5 py-2 text-xs text-muted-foreground">{t("together.markerHint")}</p>
                </>
              )}
            </Panel>

            <Panel className="flex flex-col gap-3 p-4 sm:p-5">
              <h2 className="text-base font-semibold">{t("together.rarely")}</h2>
              {associations.rarely.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("together.noneRarely")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {associations.rarely.map((item) => (
                    <li key={item.name} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 flex-col">
                        <Link href={href(view, { tab: "together", card: item.name })} className="truncate text-sm font-medium hover:underline">
                          {item.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {t("together.insteadOf", { with: pct(item.withShare), base: pct(item.baseShare) })}
                        </span>
                      </span>
                      <span className="font-mono text-sm text-rose-700 dark:text-rose-400">×{dec(item.lift)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={href(view, { tab: "decks", card: card.name })}
                className="mt-auto inline-flex items-center gap-1 border-t border-border pt-3 text-sm text-primary hover:underline"
              >
                {t("together.seeDecks", { count: card.decks })}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

const SET_COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#64748b"];

export function SetsTab({ view, sets }: { view: MetaView; sets: SetStat[] }) {
  const { t } = view;
  const { pct } = formatters(view.locale);
  const domainColumns = [
    ...new Set(sets.flatMap((set) => Object.keys(set.staplesByDomain)).filter((domain) => domain !== COLORLESS)),
  ].sort((a, b) => a.localeCompare(b));
  if (sets.some((set) => set.staplesByDomain[COLORLESS])) domainColumns.push(COLORLESS);

  return (
    <div className="flex flex-col gap-5">
      <Panel className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">{t("sets.origin")}</h2>
          <span className="text-xs text-muted-foreground">{t("sets.originHint")}</span>
        </div>
        <div className="flex h-8 overflow-hidden rounded-lg" role="img" aria-label={sets.map((set) => `${set.setCode} ${pct(set.copiesShare)}`).join(", ")}>
          {sets.map((set, index) => (
            <div
              key={set.setCode}
              className="flex items-center justify-center overflow-hidden text-xs font-semibold whitespace-nowrap text-white"
              style={{ width: `${set.copiesShare * 100}%`, background: SET_COLORS[index % SET_COLORS.length] }}
            >
              {set.copiesShare >= 0.08 && `${set.setCode} ${pct(set.copiesShare)}`}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sets.map((set, index) => (
          <Panel key={set.setCode} className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-sm" style={{ background: SET_COLORS[index % SET_COLORS.length] }} aria-hidden />
              <span className="font-mono text-sm font-semibold">{set.setCode}</span>
              <span className="truncate text-sm text-muted-foreground">{set.name !== set.setCode ? set.name : ""}</span>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              <div>
                <dd className="text-2xl font-bold text-amber-700 dark:text-amber-400">{set.staples}</dd>
                <dt className="text-xs text-muted-foreground">{t("sets.staples")}</dt>
              </div>
              <div>
                <dd className="text-2xl font-bold">{set.played}</dd>
                <dt className="text-xs text-muted-foreground">
                  {set.total ? t("sets.playedOf", { total: set.total }) : t("sets.played")}
                </dt>
              </div>
              <div>
                <dd className="text-2xl font-bold">{pct(set.copiesShare)}</dd>
                <dt className="text-xs text-muted-foreground">{t("sets.slots")}</dt>
              </div>
            </dl>
            <div className="border-t border-border pt-2">
              <p className="mb-1 text-xs text-muted-foreground">{t("sets.topCards")}</p>
              <ul className="flex flex-col gap-0.5">
                {set.topCards.map((stat) => (
                  <li key={stat.name} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={href(view, { tab: "together", card: stat.name })} className="truncate hover:underline">
                      {stat.name}
                    </Link>
                    <span className="font-mono text-xs text-muted-foreground">{pct(stat.share)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        ))}
      </div>

      {domainColumns.length > 0 && (
        <Panel className="overflow-hidden">
          <h2 className="px-4 py-3 text-base font-semibold sm:px-5">{t("sets.matrix")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-y border-border text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 text-left font-medium sm:px-5">
                    {t("columns.set")}
                  </th>
                  {domainColumns.map((domain) => (
                    <th key={domain} scope="col" className="px-2 py-2 text-center font-medium">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: domain === COLORLESS ? COLORLESS_COLOR : domainColor(domain) }}
                          aria-hidden
                        />
                        {domain}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">
                    {t("sets.total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sets.map((set) => (
                  <tr key={set.setCode} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-2 text-left font-normal sm:px-5">
                      <span className="font-mono font-semibold">{set.setCode}</span>{" "}
                      <span className="text-muted-foreground">{set.name !== set.setCode ? set.name : ""}</span>
                    </th>
                    {domainColumns.map((domain) => {
                      const count = set.staplesByDomain[domain] ?? 0;
                      return (
                        <td key={domain} className={cn("px-2 py-2 text-center font-mono", count === 0 && "text-muted-foreground/50")}>
                          {count}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-mono font-semibold sm:px-5">{set.staples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

export function DecksTab({ view }: { view: MetaView }) {
  const { t } = view;
  const card = view.state.card;
  const withCard = card
    ? view.decks.filter((deck) => deck.cards.some((entry) => view.sample.cards[entry.cardId]?.name === card))
    : view.decks;
  const sorted = withCard
    .slice()
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate) || placementRank(a.placement) - placementRank(b.placement));
  const totalPages = Math.max(1, Math.ceil(sorted.length / DECKS_PER_PAGE));
  const page = Math.min(view.state.page, totalPages);
  const start = (page - 1) * DECKS_PER_PAGE;

  return (
    <div className="flex flex-col gap-4">
      {card && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span>{t("decks.withCard", { name: card, count: sorted.length })}</span>
          <Link href={href(view, { card: undefined })} scroll={false} className="text-primary hover:underline">
            {t("decks.clearCard")}
          </Link>
        </div>
      )}
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-border">
          {sorted.slice(start, start + DECKS_PER_PAGE).map((deck) => {
            const legend = deck.legendCardId ? view.sample.cards[deck.legendCardId] : undefined;
            const date = DateTime.fromISO(deck.eventDate).setLocale(view.locale).toLocaleString(DateTime.DATE_MED);
            return (
              <li key={deck.id}>
                <Link href={`/decks/${deck.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 sm:px-5">
                  <Thumb src={legend?.image ?? deck.coverImage} className="h-14 w-10" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-semibold">{deck.name}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <DomainDots domains={deck.domains} />
                      <span>{legendLabel(deck, view.sample.cards)}</span>
                      {deck.pilot && <span>· {deck.pilot}</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{deck.source}</span>
                      <span>· {date}</span>
                      {deck.placement && (
                        <span className={cn(isTopCut(deck.placement) && "font-medium text-foreground")}>· {deck.placement}</span>
                      )}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>
      <Pagination view={view} page={page} totalPages={totalPages} total={sorted.length} unit="decks" />
    </div>
  );
}

/** Le rang d'un classement pour trier : le premier nombre, les decks sans classement à la fin. */
function placementRank(placement: string | undefined): number {
  const rank = placement?.match(/\d+/);
  return rank ? Number(rank[0]) : Number.MAX_SAFE_INTEGER;
}
