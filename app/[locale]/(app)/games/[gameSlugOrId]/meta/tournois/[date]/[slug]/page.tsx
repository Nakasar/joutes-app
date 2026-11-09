import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Trophy } from "lucide-react";
import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { BackLink } from "@/components/navigation/BackLink.tsx";
import { GameToolGridSkeleton, GameToolHeaderSkeleton } from "@/components/games/GameToolSkeletons.tsx";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { loadMetaEventsMatches } from "@/lib/db/meta-events.ts";
import { loadMetaSample } from "@/lib/meta/load.ts";
import { domainColor } from "@/lib/meta/domains.ts";
import { legendKey, legendLabel, type MetaSample, type MetaSampleDeck } from "@/lib/meta/stats.ts";
import {
  domainWinrates,
  facedLegends,
  legendMatchups,
  legendWinrates,
  matchTotals,
  MIN_MATCHES_FOR_RATE,
  mostLopsidedMatchup,
  playerRounds,
  shortLegendName,
  topCutPlayers,
  type MetaEventMatches,
} from "@/lib/meta/match-stats.ts";
import {
  byPlacement,
  computeTournamentStats,
  findTournamentDecks,
  findTournamentMatches,
  placementRank,
  type TournamentStats,
} from "@/lib/meta/tournaments.ts";
import { cn } from "@/lib/utils.ts";
import { Donut, DonutKey, LEGEND_COLORS, LegendThumb, OTHERS_COLOR, swatchBackground, type DonutPart } from "../../../charts.tsx";
import {
  DomainWinratesPanel,
  FacedLegendsList,
  LegendWinratesPanel,
  MatchPanel,
  MatchupsPanel,
  PhaseToggle,
  PlayerLink,
  RoundStrip,
} from "../../../matches.tsx";

type Params = Promise<{ gameSlugOrId: string; date: string; slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface TournamentPageProps {
  params: Params;
  searchParams: SearchParams;
}

const DECKS_PER_PAGE = 30;
/** Au-delà, les légendes se regroupent dans « Autres » sur les camemberts. */
const PIE_LEGENDS = LEGEND_COLORS.length;

type T = Awaited<ReturnType<typeof getTranslations>>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/** Le jeu, l'échantillon de sa méta et les decks du tournoi ; une page introuvable sinon. */
async function loadTournament(params: Params) {
  const { gameSlugOrId, date, slug } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  if (!game?.features?.meta) notFound();
  const sample = await loadMetaSample(game.id, game.slug);
  const decks = findTournamentDecks(sample.decks, date, slug);
  if (decks.length === 0) notFound();
  const matches = findTournamentMatches(await loadMetaEventsMatches(game.id), date, slug);
  return { game, sample, decks, date, slug, matches, metaPath: `/games/${game.slug ?? game.id}/meta` };
}

export async function generateMetadata({ params }: TournamentPageProps): Promise<Metadata> {
  const { gameSlugOrId, date, slug } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.meta");
  if (!game?.features?.meta) return { title: t("metadata.notFoundTitle") };
  const sample = await loadMetaSample(game.id, game.slug);
  const decks = findTournamentDecks(sample.decks, date, slug);
  if (decks.length === 0) return { title: t("metadata.notFoundTitle") };

  const title = t("tournament.metadataTitle", { source: decks[0].source, gameName: game.name });
  const description = t("tournament.metadataDescription", { source: decks[0].source, count: decks.length, date });
  return { title, description, openGraph: { title, description, images: game.banner ? [game.banner] : [] } };
}

/**
 * La méta d'un tournoi : les decks méta de même source et de même date
 * (`lib/meta/tournaments.ts`), leurs légendes, domaines et classements.
 * Page publique, tirée du même échantillon en cache que la méta du jeu.
 */
export default function TournamentMetaPage({ params, searchParams }: TournamentPageProps) {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <Suspense
        fallback={
          <>
            <GameToolHeaderSkeleton />
            <GameToolGridSkeleton cards={4} />
          </>
        }
      >
        <TournamentContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TournamentContent({ params, searchParams }: TournamentPageProps) {
  const [{ game, sample, decks, date, slug, matches, metaPath }, raw, t, locale] = await Promise.all([
    loadTournament(params),
    searchParams,
    getTranslations("Games.meta"),
    getLocale(),
  ]);
  const stats = computeTournamentStats(decks, sample.cards);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const pct = (value: number) => percent.format(value);
  const source = decks[0].source;
  const day = DateTime.fromISO(date, { zone: "utc" }).setLocale(locale).toLocaleString(DateTime.DATE_HUGE);
  const hasTop = stats.topCut.length > 0;
  const requestedView = first(raw.vue);
  const view: TournamentView = matches && (requestedView === "matchs" || requestedView === "classement") ? requestedView : "decks";
  const totals = matches ? matchTotals([matches]) : undefined;
  const tournamentHref = `${metaPath}/tournois/${date}/${slug}`;

  return (
    <>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline">
            <BackLink href={`${metaPath}?tab=tournaments`} label={t("tournament.back")}>
              ←{" "}
            </BackLink>
          </Button>
          <span className="text-sm text-muted-foreground">{t("title", { gameName: game.name })}</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight">
              <Trophy className="size-7 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 break-words">{source}</span>
            </h1>
            <p className="text-muted-foreground">
              {t("tournament.summary", { date: day, decks: stats.decks })} ·{" "}
              {stats.ranked > 0 ? t("tournament.ranked", { count: stats.ranked }) : t("tournament.noRanking")}
              {matches && totals && (
                <>
                  {" "}
                  · {t("matches.summary", { players: matches.players.length, rounds: totals.rounds, matches: totals.matches })}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`${tournamentHref}#decks`}>{t("tournament.seeDecks", { count: stats.decks })}</Link>
            </Button>
            <Button asChild>
              <Link href={metaPath}>{t("tournament.global")}</Link>
            </Button>
          </div>
        </div>
        {matches && (
          <nav aria-label={t("matches.tabs.label")} className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
            {(["decks", "matchs", "classement"] as const).map((key) => (
              <Link
                key={key}
                href={key === "decks" ? tournamentHref : `${tournamentHref}?vue=${key}`}
                scroll={false}
                aria-current={view === key ? "page" : undefined}
                className={cn(
                  "-mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
                  view === key && "border-primary font-semibold text-foreground"
                )}
              >
                {t(`matches.tabs.${key}`)}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {matches && view === "matchs" && (
        <MatchesView t={t} event={matches} locale={locale} raw={raw} tournamentHref={tournamentHref} />
      )}
      {matches && view === "classement" && <StandingsView t={t} event={matches} tournamentHref={tournamentHref} />}
      {view === "decks" && <DecksView t={t} stats={stats} decks={decks} sample={sample} pct={pct} decimal={decimal} hasTop={hasTop} raw={raw} />}
    </>
  );
}

type TournamentView = "decks" | "matchs" | "classement";

function DecksView({
  t,
  stats,
  decks,
  sample,
  pct,
  decimal,
  hasTop,
  raw,
}: {
  t: T;
  stats: TournamentStats;
  decks: MetaSampleDeck[];
  sample: MetaSample;
  pct: (value: number) => string;
  decimal: Intl.NumberFormat;
  hasTop: boolean;
  raw: Record<string, string | string[] | undefined>;
}) {
  return (
    <>
      <Kpis t={t} stats={stats} decks={decks} sample={sample} pct={pct} />
      <LegendsPanel t={t} stats={stats} pct={pct} decimal={decimal} hasTop={hasTop} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DomainsPanel t={t} stats={stats} pct={pct} hasTop={hasTop} />
        {hasTop && <TopCutPanel t={t} stats={stats} sample={sample} />}
      </div>

      {stats.combos.length > 1 && <CombosPanel t={t} stats={stats} pct={pct} hasTop={hasTop} />}

      {stats.ranked > 0 && stats.tiers.length > 1 && <TiersPanel t={t} stats={stats} />}
      {(stats.cardsUp.length > 0 || stats.cardsDown.length > 0) && <CardsPanel t={t} stats={stats} pct={pct} />}

      <DecksPanel t={t} decks={decks} sample={sample} stats={stats} raw={raw} />
    </>
  );
}

function Panel({ className, children, id }: { className?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      {children}
    </section>
  );
}

function PanelTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Un chiffre clé ; `image` (une chaîne, même vide) y ajoute la vignette d'une légende. */
function Kpi({ label, value, hint, image }: { label: string; value: string; hint: string; image?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-4">
      {image !== undefined && <LegendThumb src={image || undefined} className="hidden h-16 w-12 sm:block" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="truncate text-xl font-bold tracking-tight">{value}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}

function Kpis({
  t,
  stats,
  decks,
  sample,
  pct,
}: {
  t: T;
  stats: TournamentStats;
  decks: MetaSampleDeck[];
  sample: MetaSample;
  pct: (value: number) => string;
}) {
  const winner = decks.find((deck) => placementRank(deck.placement) === 1);
  const legend = stats.legends[0];
  const domain = stats.domains[0];
  const hasTop = stats.topCut.length > 0;
  const winnerDomains = winner?.domains.join(", ");

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label={t("tournament.kpi.winner")}
        value={winner ? (legendLabel(winner, sample.cards) ?? winner.name) : t("tournament.kpi.noWinner")}
        image={winner ? ((winner.legendCardId && sample.cards[winner.legendCardId]?.image) || winner.coverImage || "") : undefined}
        hint={winner ? [winner.pilot, winnerDomains].filter(Boolean).join(" · ") : t("tournament.kpi.noWinnerHint")}
      />
      {legend && (
        <Kpi
          label={t("tournament.kpi.topLegend")}
          value={`${legend.name} · ${pct(legend.share)}`}
          image={legend.image ?? ""}
          hint={
            hasTop
              ? t("tournament.kpi.topLegendTopHint", { decks: legend.decks, total: stats.decks, topCuts: legend.topCuts })
              : t("tournament.kpi.topLegendHint", { decks: legend.decks, total: stats.decks })
          }
        />
      )}
      {domain && (
        <Kpi
          label={t("tournament.kpi.topDomain")}
          value={`${domain.domain} · ${pct(domain.decks / stats.decks)}`}
          hint={
            hasTop
              ? t("tournament.kpi.topDomainTopHint", { share: pct(domain.topSlotShare) })
              : t("tournament.kpi.topDomainHint", { share: pct(domain.decks / stats.decks) })
          }
        />
      )}
      <Kpi
        label={t("tournament.kpi.legends")}
        value={String(stats.legends.length)}
        hint={
          hasTop
            ? t("tournament.kpi.legendsHint", { count: stats.legends.filter((entry) => entry.topCuts > 0).length })
            : t("tournament.kpi.legendsNoTopHint", { decks: stats.decks })
        }
      />
    </div>
  );
}

/** Les légendes en parts de camembert : les plus jouées en couleur, le reste dans « Autres ». */
function legendParts(t: T, stats: TournamentStats, pick: "decks" | "topCuts"): DonutPart[] {
  const parts: DonutPart[] = stats.legends
    .slice(0, PIE_LEGENDS)
    .map((legend, index) => ({ label: legend.name, value: legend[pick], color: LEGEND_COLORS[index] }));
  const others = stats.legends.slice(PIE_LEGENDS).reduce((sum, legend) => sum + legend[pick], 0);
  return others > 0 ? [...parts, { label: t("tournament.legends.others"), value: others, color: OTHERS_COLOR }] : parts;
}

function LegendsPanel({
  t,
  stats,
  pct,
  decimal,
  hasTop,
}: {
  t: T;
  stats: TournamentStats;
  pct: (value: number) => string;
  decimal: Intl.NumberFormat;
  hasTop: boolean;
}) {
  const all = legendParts(t, stats, "decks");
  const top = legendParts(t, stats, "topCuts");
  const maxShare = stats.legends[0]?.share ?? 1;
  const unit = t("tournament.legends.decksUnit");
  const columns = hasTop
    ? "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_3.5rem_3.5rem_8rem_5.5rem]"
    : "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_3.5rem]";

  return (
    <Panel>
      <PanelTitle title={t("tournament.legends.title")} />
      <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
        <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
          <Donut className="w-36 sm:w-52" title={t("tournament.legends.all")} center={String(stats.decks)} unit={unit} parts={all} formatShare={pct} />
          {hasTop && (
            <Donut
              className="w-36 sm:w-52"
              title={t("tournament.legends.top")}
              center={String(stats.topCut.length)}
              unit={unit}
              parts={top}
              formatShare={pct}
            />
          )}
        </div>
        <div className="min-w-64 flex-1 basis-80 lg:max-w-md">
          <DonutKey
            firstLabel={t("tournament.legends.all")}
            secondLabel={hasTop ? t("tournament.legends.top") : undefined}
            rows={all.map((part, index) => ({
              label: part.label,
              color: part.color,
              withThumb: true,
              image: index < PIE_LEGENDS ? stats.legends[index]?.image : undefined,
              first: pct(part.value / stats.decks),
              second: hasTop ? (top[index]?.value ? pct(top[index].value / stats.topCut.length) : "—") : undefined,
            }))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("tournament.legends.detail")}</h3>
          {hasTop && <span className="text-xs text-muted-foreground">{t("tournament.legends.conversionHint")}</span>}
        </div>
        <div className={cn("hidden gap-3 py-2 text-xs font-medium text-muted-foreground sm:grid", columns)}>
          <span>{t("tournament.legends.legend")}</span>
          <span>{t("tournament.legends.share")}</span>
          <span className="text-right">{t("tournament.legends.decks")}</span>
          {hasTop && (
            <>
              <span className="text-right">{t("tournament.legends.topCuts")}</span>
              <span>{t("tournament.legends.best")}</span>
              <span className="text-right">{t("tournament.legends.conversion")}</span>
            </>
          )}
        </div>
        <ul className="flex flex-col">
          {stats.legends.map((legend, index) => {
            const conversion = legend.conversion;
            const good = conversion !== undefined && conversion >= 1.2;
            const bad = conversion !== undefined && legend.topCuts > 0 && conversion < 1;
            return (
              <li key={legend.key} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-border py-2.5 text-sm", columns)}>
                <span className="flex min-w-0 items-center gap-3">
                  <LegendThumb src={legend.image} className="h-12 w-9" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold">{legend.name}</span>
                    <span className="flex flex-wrap gap-x-2.5 text-xs text-muted-foreground">
                      {legend.domains.map((domain) => (
                        <span key={domain} className="inline-flex items-center gap-1">
                          <span className="size-2 rounded-full" style={{ background: domainColor(domain) }} aria-hidden />
                          {domain}
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
                <span className="order-last col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(legend.share / maxShare) * 100}%`, background: LEGEND_COLORS[index] ?? OTHERS_COLOR }}
                    />
                  </span>
                  <span className="w-10 text-right font-mono tabular-nums">{pct(legend.share)}</span>
                </span>
                <span className="text-right font-mono tabular-nums">
                  {legend.decks}
                  {hasTop && <span className="text-muted-foreground sm:hidden"> · {t("tournament.legends.topCuts")} : {legend.topCuts}</span>}
                </span>
                {hasTop && (
                  <>
                    <span className="hidden text-right font-mono tabular-nums sm:block">{legend.topCuts}</span>
                    <span className="hidden text-muted-foreground sm:block">{legend.best ?? "—"}</span>
                    <span className="hidden text-right sm:block">
                      <span
                        className={cn(
                          "inline-block min-w-12 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums",
                          good
                            ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                            : bad
                              ? "bg-orange-500/15 text-orange-800 dark:text-orange-300"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {legend.topCuts > 0 && conversion !== undefined ? `×${decimal.format(conversion)}` : "—"}
                      </span>
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}

function DomainsPanel({ t, stats, pct, hasTop }: { t: T; stats: TournamentStats; pct: (value: number) => string; hasTop: boolean }) {
  const unit = t("tournament.legends.decksUnit");
  const all = stats.domains.map((domain) => ({ label: domain.domain, value: domain.decks, color: domainColor(domain.domain) }));
  const top = stats.domains.map((domain) => ({ label: domain.domain, value: domain.topDecks, color: domainColor(domain.domain) }));

  return (
    <Panel>
      <PanelTitle title={t("tournament.domains.title")} hint={t("tournament.domains.hint")} />
      <div className="flex flex-wrap justify-center gap-6">
        <Donut className="w-36 sm:w-44" title={t("tournament.legends.all")} center={String(stats.decks)} unit={unit} parts={all} formatShare={pct} />
        {hasTop && (
          <Donut
            className="w-36 sm:w-44"
            title={t("tournament.legends.top")}
            center={String(stats.topCut.length)}
            unit={unit}
            parts={top}
            formatShare={pct}
          />
        )}
      </div>
      <DonutKey
        firstLabel={t("tournament.legends.all")}
        secondLabel={hasTop ? t("tournament.legends.top") : undefined}
        rows={stats.domains.map((domain) => ({
          label: domain.domain,
          color: domainColor(domain.domain),
          first: pct(domain.slotShare),
          second: hasTop ? pct(domain.topSlotShare) : undefined,
        }))}
      />
    </Panel>
  );
}

/** Les combinaisons exactes de domaines (paires, decks à un ou trois domaines…), comme les légendes : en camemberts. */
function CombosPanel({ t, stats, pct, hasTop }: { t: T; stats: TournamentStats; pct: (value: number) => string; hasTop: boolean }) {
  const unit = t("tournament.legends.decksUnit");
  const label = (domains: string[]) => (domains.length > 0 ? domains.join(" + ") : t("tournament.combos.none"));
  const shown = stats.combos.slice(0, PIE_LEGENDS);
  const rest = stats.combos.slice(PIE_LEGENDS);
  const parts = (pick: "decks" | "topDecks"): DonutPart[] => {
    // Chaque groupe garde les couleurs de ses domaines, en dégradé : Fury + Order va du rouge au jaune.
    const list = shown.map((combo) => {
      const colors = combo.domains.map(domainColor);
      return { label: label(combo.domains), value: combo[pick], color: swatchBackground(colors, OTHERS_COLOR), colors };
    });
    const others = rest.reduce((sum, combo) => sum + combo[pick], 0);
    return others > 0 ? [...list, { label: t("tournament.legends.others"), value: others, color: OTHERS_COLOR }] : list;
  };
  const all = parts("decks");
  const top = parts("topDecks");

  return (
    <Panel>
      <PanelTitle title={t("tournament.combos.title")} hint={t("tournament.combos.hint")} />
      <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
        <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
          <Donut className="w-36 sm:w-52" title={t("tournament.legends.all")} center={String(stats.decks)} unit={unit} parts={all} formatShare={pct} />
          {hasTop && (
            <Donut
              className="w-36 sm:w-52"
              title={t("tournament.legends.top")}
              center={String(stats.topCut.length)}
              unit={unit}
              parts={top}
              formatShare={pct}
            />
          )}
        </div>
        <div className="min-w-64 flex-1 basis-80 lg:max-w-md">
          <DonutKey
            firstLabel={t("tournament.legends.all")}
            secondLabel={hasTop ? t("tournament.legends.top") : undefined}
            rows={all.map((part, index) => ({
              label: part.label,
              color: part.color,
              first: pct(part.value / stats.decks),
              second: hasTop ? (top[index]?.value ? pct(top[index].value / stats.topCut.length) : "—") : undefined,
            }))}
          />
        </div>
      </div>
    </Panel>
  );
}

function TopCutPanel({ t, stats, sample }: { t: T; stats: TournamentStats; sample: MetaSample }) {
  return (
    <Panel>
      <PanelTitle title={t("tournament.topCut.title")} hint={t("tournament.topCut.hint")} />
      <ol className="flex flex-col">
        {stats.topCut.map((deck) => (
          <li key={deck.id} className="border-t border-border first:border-t-0">
            <DeckLink deck={deck} sample={sample} highlight={placementRank(deck.placement) === 1} />
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function DeckLink({ deck, sample, highlight }: { deck: MetaSampleDeck; sample: MetaSample; highlight?: boolean }) {
  const legend = deck.legendCardId ? sample.cards[deck.legendCardId] : undefined;
  return (
    <Link href={`/decks/${deck.id}`} className="flex min-h-14 items-center gap-3 py-2 hover:bg-muted/50 sm:px-2">
      <span className={cn("w-16 shrink-0 text-sm font-semibold tabular-nums", highlight && "text-amber-700 dark:text-amber-400")}>
        {deck.placement ?? "—"}
      </span>
      {legend?.image || deck.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={legend?.image ?? deck.coverImage} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded object-cover" />
      ) : (
        <span className="h-12 w-9 shrink-0 rounded bg-muted" aria-hidden />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold">{deck.name}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span role="img" className="inline-flex gap-1" aria-label={deck.domains.join(", ")}>
            {deck.domains.map((domain) => (
              <span key={domain} className="size-2 rounded-full" style={{ background: domainColor(domain) }} aria-hidden />
            ))}
          </span>
          <span>{legendLabel(deck, sample.cards)}</span>
          {deck.pilot && <span>· {deck.pilot}</span>}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function TiersPanel({ t, stats }: { t: T; stats: TournamentStats }) {
  return (
    <Panel>
      <PanelTitle title={t("tournament.tiers.title")} hint={t("tournament.tiers.hint")} />
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[34rem] border-separate border-spacing-1 text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="w-1/4" />
              {stats.tiers.map(({ tier, decks }) => (
                <th key={tier} scope="col" className="px-1 py-1.5 font-medium">
                  <span className="block text-foreground">{t(`tournament.tiers.${tier}`)}</span>
                  <span className="font-normal">{t("tournament.tiers.count", { count: decks })}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.legends.map((legend) => (
              <tr key={legend.key}>
                <th scope="row" className="max-w-48 py-1 pr-2 text-left font-medium">
                  <span className="flex min-w-0 items-center gap-2">
                    <LegendThumb src={legend.image} className="h-8 w-6" />
                    <span className="truncate">{legend.name}</span>
                  </span>
                </th>
                {(stats.matrix[legend.key] ?? []).map((count, index) => {
                  const weight = count / stats.tiers[index].decks;
                  return (
                    <td
                      key={stats.tiers[index].tier}
                      className={cn(
                        "h-9 rounded-md text-center font-semibold tabular-nums",
                        count === 0 ? "bg-muted/60 text-muted-foreground" : weight >= 0.25 ? "text-white" : "text-foreground"
                      )}
                      style={count > 0 ? { background: `rgb(11 109 158 / ${Math.min(1, 0.12 + weight * 1.6).toFixed(2)})` } : undefined}
                    >
                      {count === 0 ? "·" : count}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CardsPanel({ t, stats, pct }: { t: T; stats: TournamentStats; pct: (value: number) => string }) {
  const column = (title: string, cards: TournamentStats["cardsUp"], tone: string) => (
    <div className="flex min-w-0 flex-col">
      <h3 className={cn("pb-2 text-sm font-semibold", tone)}>{title}</h3>
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("tournament.cards.none")}</p>
      ) : (
        <ul className="flex flex-col">
          {cards.map((card) => (
            <li key={card.name} className="flex items-center gap-3 border-t border-border py-2">
              {card.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.image} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded object-cover" />
              ) : (
                <span className="h-12 w-9 shrink-0 rounded bg-muted" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">{card.name}</span>
              <span className="shrink-0 text-sm tabular-nums">
                <span className="font-semibold">{pct(card.top)}</span>{" "}
                <span className="text-muted-foreground">{t("tournament.cards.versus", { share: pct(card.rest) })}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Panel>
      <PanelTitle title={t("tournament.cards.title")} hint={t("tournament.cards.hint")} />
      <div className="grid gap-6 md:grid-cols-2">
        {column(t("tournament.cards.up"), stats.cardsUp, "text-primary")}
        {column(t("tournament.cards.down"), stats.cardsDown, "text-orange-700 dark:text-orange-400")}
      </div>
    </Panel>
  );
}

function DecksPanel({
  t,
  decks,
  sample,
  stats,
  raw,
}: {
  t: T;
  decks: MetaSampleDeck[];
  sample: MetaSample;
  stats: TournamentStats;
  raw: Record<string, string | string[] | undefined>;
}) {
  const legend = first(raw.legend);
  const filtered = (legend ? decks.filter((deck) => legendKey(deck) === legend) : decks).slice().sort(byPlacement);
  const totalPages = Math.max(1, Math.ceil(filtered.length / DECKS_PER_PAGE));
  const requested = Number(first(raw.page));
  const page = Number.isInteger(requested) && requested > 1 ? Math.min(requested, totalPages) : 1;
  const start = (page - 1) * DECKS_PER_PAGE;
  const query = (overrides: { legend?: string; page?: number }) => {
    const params = new URLSearchParams();
    const nextLegend = "legend" in overrides ? overrides.legend : legend;
    if (nextLegend) params.set("legend", nextLegend);
    if (overrides.page && overrides.page > 1) params.set("page", String(overrides.page));
    const search = params.toString();
    return `${search ? `?${search}` : "?"}#decks`;
  };

  return (
    <Panel id="decks" className="scroll-mt-20">
      <PanelTitle title={t("tournament.decks.title", { count: decks.length })} />
      {stats.legends.length > 1 && (
        <nav aria-label={t("tournament.decks.filter")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip href={query({ legend: undefined })} active={!legend} label={t("tournament.decks.all")} count={decks.length} />
          {stats.legends.map((entry) => (
            <Chip
              key={entry.key}
              href={query({ legend: entry.key })}
              active={entry.key === legend}
              label={entry.name}
              count={entry.decks}
              image={entry.image}
            />
          ))}
        </nav>
      )}
      <ul className="flex flex-col">
        {filtered.slice(start, start + DECKS_PER_PAGE).map((deck) => (
          <li key={deck.id} className="border-t border-border first:border-t-0">
            <DeckLink deck={deck} sample={sample} highlight={placementRank(deck.placement) === 1} />
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <nav aria-label={t("pagination.label")} className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{t("pagination.decks", { page, totalPages, total: filtered.length })}</span>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className={cn(page <= 1 && "pointer-events-none opacity-50")}>
              <Link href={query({ page: page - 1 })} aria-disabled={page <= 1}>
                {t("pagination.previous")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className={cn(page >= totalPages && "pointer-events-none opacity-50")}>
              <Link href={query({ page: page + 1 })} aria-disabled={page >= totalPages}>
                {t("pagination.next")}
              </Link>
            </Button>
          </div>
        </nav>
      )}
    </Panel>
  );
}

function Chip({ href, active, label, count, image }: { href: string; active: boolean; label: string; count: number; image?: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap",
        image && "pl-1.5",
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted"
      )}
    >
      {image && <LegendThumb src={image} className="h-6 w-[18px]" />}
      {label}
      <span className="font-mono text-xs text-muted-foreground">{count}</span>
    </Link>
  );
}

/** Le classement lu sur le locator, en place lisible : 1 donne « 1er ». */
function placeLabel(t: T, place: number | undefined): string {
  return place === undefined ? "–" : t("matches.standings.place", { place });
}

function MatchesView({
  t,
  event,
  locale,
  raw,
  tournamentHref,
}: {
  t: T;
  event: MetaEventMatches;
  locale: string;
  raw: Record<string, string | string[] | undefined>;
  tournamentHref: string;
}) {
  const includeTop = first(raw.phases) === "top";
  const hasTopPhase = event.matches.some((match) => match.phase === "top");
  const filter = { includeTop };
  const legends = legendWinrates([event], filter);
  const domains = domainWinrates([event], filter);
  const matchups = legendMatchups([event], filter);
  const lopsided = mostLopsidedMatchup(matchups);
  const totals = matchTotals([event]);
  const rateFormat = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const rate = (value: number) => rateFormat.format(value);
  const wholePercent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const best = legends.find((row) => row.matches >= MIN_MATCHES_FOR_RATE);
  const bestDomain = domains.find((row) => row.matches >= MIN_MATCHES_FOR_RATE);
  const unknownPlayers = event.players.filter((player) => !player.legend).length;
  const top = topCutPlayers(event, 8);
  const faced = facedLegends(
    event,
    top.map((player) => player.id)
  );
  const topMatches = top.reduce(
    (sum, player) => sum + playerRounds(event, player.id).filter((round) => round.result !== "BYE").length,
    0
  );
  const playerHref = (id: number) => `${tournamentHref}/joueurs/${id}`;
  const toggle = hasTopPhase ? (
    <PhaseToggle t={t} includeTop={includeTop} href={(value) => `${tournamentHref}?vue=matchs${value ? "&phases=top" : ""}`} />
  ) : undefined;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={t("matches.kpi.bestLegend")}
          value={best?.rate !== undefined ? `${shortLegendName(best.legend)} · ${rate(best.rate)}` : "—"}
          image={best ? (best.legendImage ?? "") : undefined}
          hint={best ? t("matches.kpi.bestLegendHint", { matches: best.matches }) : t("matches.kpi.noRate", { min: MIN_MATCHES_FOR_RATE })}
        />
        <Kpi
          label={t("matches.kpi.lopsided")}
          value={lopsided ? `${shortLegendName(lopsided.legend)} – ${shortLegendName(lopsided.opponent)} · ${wholePercent.format(lopsided.rate)}` : "—"}
          hint={lopsided ? t("matches.kpi.lopsidedHint", { matches: lopsided.matches }) : t("matches.kpi.noRate", { min: MIN_MATCHES_FOR_RATE })}
        />
        <Kpi
          label={t("matches.kpi.bestDomain")}
          value={bestDomain?.rate !== undefined ? `${bestDomain.domain} · ${rate(bestDomain.rate)}` : "—"}
          hint={bestDomain ? t("matches.kpi.bestDomainHint", { matches: bestDomain.matches }) : t("matches.kpi.noRate", { min: MIN_MATCHES_FOR_RATE })}
        />
        <Kpi
          label={t("matches.kpi.draws")}
          value={totals.matches > 0 ? wholePercent.format(totals.draws / totals.matches) : "—"}
          hint={t("matches.kpi.drawsHint", { draws: totals.draws, byes: totals.byes })}
        />
      </div>

      <LegendWinratesPanel t={t} rows={legends} rate={rate} toggle={toggle} unknownPlayers={unknownPlayers} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <DomainWinratesPanel t={t} rows={domains} rate={rate} />
        <MatchupsPanel t={t} legends={legends} matchups={matchups} rate={rate} />
      </div>

      {top.length > 0 && (
        <MatchPanel>
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{t("matches.faced.title", { count: top.length })}</h2>
            <p className="text-sm text-muted-foreground">{t("matches.faced.hint", { matches: topMatches, players: top.length })}</p>
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <h3 className="text-sm font-semibold">{t("matches.faced.legends")}</h3>
              <FacedLegendsList t={t} rows={faced} />
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <h3 className="text-sm font-semibold">{t("matches.faced.rounds")}</h3>
              <ol className="flex flex-col">
                {top.map((player) => (
                  <li key={player.id} className="flex flex-col gap-2 border-t border-border py-2.5 first:border-t-0 sm:flex-row sm:items-center">
                    <span className="flex min-w-0 items-center gap-2 sm:w-52 sm:shrink-0">
                      <span className="w-9 shrink-0 text-sm font-semibold tabular-nums">{placeLabel(t, player.place)}</span>
                      <PlayerLink player={player} href={playerHref(player.id)} />
                    </span>
                    <RoundStrip t={t} rounds={playerRounds(event, player.id)} />
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">{t("matches.faced.roundsHint")}</p>
            </div>
          </div>
        </MatchPanel>
      )}
    </>
  );
}

function StandingsView({ t, event, tournamentHref }: { t: T; event: MetaEventMatches; tournamentHref: string }) {
  const players = event.players
    .slice()
    .sort((a, b) => (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
  return (
    <MatchPanel>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("matches.standings.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("matches.standings.hint", { count: players.length })}</p>
      </div>
      <ol className="flex flex-col">
        {players.map((player) => (
          <li
            key={player.id}
            className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-2 text-sm first:border-t-0 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,12rem)_5rem]"
          >
            <span className="font-semibold tabular-nums">{placeLabel(t, player.place)}</span>
            <PlayerLink player={player} href={`${tournamentHref}/joueurs/${player.id}`} />
            <span className="hidden min-w-0 flex-wrap gap-x-2.5 text-xs text-muted-foreground sm:flex">
              {player.domains.map((domain) => (
                <span key={domain} className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full" style={{ background: domainColor(domain) }} aria-hidden />
                  {domain}
                </span>
              ))}
            </span>
            <span className="text-right font-mono tabular-nums text-muted-foreground">{player.record}</span>
          </li>
        ))}
      </ol>
    </MatchPanel>
  );
}
