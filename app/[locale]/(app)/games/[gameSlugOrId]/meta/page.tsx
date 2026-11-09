import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ChartLine } from "lucide-react";
import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { BackLink } from "@/components/navigation/BackLink.tsx";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar.tsx";
import { GameToolGridSkeleton, GameToolHeaderSkeleton } from "@/components/games/GameToolSkeletons.tsx";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { loadMetaSample } from "@/lib/meta/load.ts";
import { META_TABS, metaHref, parseMetaPageParams, periodChoices, type MetaTab } from "@/lib/meta/page-params.ts";
import { resolveMetaSettings } from "@/lib/meta/settings.ts";
import {
  computeAssociations,
  computeCardStats,
  computeOverview,
  computeSetStats,
  computeStapleGroups,
  computeTrends,
  filterMetaDecks,
  isStaple,
  legendKey,
  legendLabel,
} from "@/lib/meta/stats.ts";
import { cn } from "@/lib/utils.ts";
import { MetaFilters } from "./MetaFilters.tsx";
import { CardsTab, DecksTab, OverviewTab, SetsTab, StaplesTab, TogetherTab, type MetaView } from "./sections.tsx";

type GameParams = Promise<{ gameSlugOrId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface MetaPageProps {
  params: GameParams;
  searchParams: SearchParams;
}

/** La méta n'existe que pour un jeu qui ouvre ses decks. */
async function requireGameWithDecks(gameSlugOrId: string) {
  const game = await readGameBySlugOrId(gameSlugOrId);
  if (!game?.features?.decks) notFound();
  return game;
}

export async function generateMetadata({ params }: MetaPageProps): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.meta");
  if (!game?.features?.decks) return { title: t("metadata.notFoundTitle") };

  const title = t("metadata.title", { gameName: game.name });
  const description = t("metadata.description", { gameName: game.name });
  return {
    title,
    description,
    openGraph: {
      url: `https://joutes.app/games/${game.slug ?? gameSlugOrId}/meta`,
      title,
      description,
      images: game.banner ? [game.banner] : [],
    },
  };
}

/**
 * La méta d'un jeu : ce que jouent les decks de tournoi relevés par l'équipe
 * (`lib/meta/load.ts`), en six onglets. Page publique.
 *
 * L'en-tête ne dépend que du jeu ; le reste dépend de l'échantillon et des
 * filtres de l'adresse (`lib/meta/page-params.ts`).
 */
export default function GameMetaPage({ params, searchParams }: MetaPageProps) {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <Suspense fallback={<GameToolHeaderSkeleton />}>
        <MetaHeader params={params} />
      </Suspense>
      <Suspense fallback={<GameToolGridSkeleton cards={4} />}>
        <MetaContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MetaHeader({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const game = await requireGameWithDecks(gameSlugOrId);
  const t = await getTranslations("Games.meta");

  return (
    <div className="flex flex-row flex-wrap justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-row flex-wrap items-center gap-4">
          <Button asChild variant="outline">
            <BackLink href={`/games/${game.slug ?? gameSlugOrId}`} label={t("back")}>
              ←{" "}
            </BackLink>
          </Button>
          <h1 className="flex items-center gap-2.5 text-3xl font-bold">
            <ChartLine className="size-7 text-primary" aria-hidden />
            {t("title", { gameName: game.name })}
          </h1>
        </div>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <GameToolsNavBar gameSlug={game.slug ?? game.id} currentTab="meta" />
    </div>
  );
}

async function MetaContent({ params, searchParams }: MetaPageProps) {
  const { gameSlugOrId } = await params;
  const game = await requireGameWithDecks(gameSlugOrId);
  const [raw, t, locale, sample] = await Promise.all([
    searchParams,
    getTranslations("Games.meta"),
    getLocale(),
    loadMetaSample(game.id, game.slug),
  ]);

  const settings = resolveMetaSettings(game.metaSettings);
  const state = parseMetaPageParams(raw, settings);
  const basePath = `/games/${game.slug ?? game.id}/meta`;

  if (sample.decks.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  // Les choix des filtres viennent de tout l'échantillon de la période, pour
  // qu'un filtre posé n'efface pas les autres options.
  const now = new Date();
  const inPeriod = filterMetaDecks(sample.decks, { periodDays: state.periodDays }, now);
  const decks = filterMetaDecks(sample.decks, state, now);
  const stats = computeCardStats(decks, sample.cards);
  const stapleSettings = { threshold: state.threshold, minDecks: settings.minDecksPerDomain };
  const staples = stats.filter((stat) => isStaple(stat, stapleSettings));

  const legendLabels = new Map<string, string>();
  for (const deck of sample.decks) {
    const key = legendKey(deck);
    if (key && !legendLabels.has(key)) legendLabels.set(key, legendLabel(deck, sample.cards) ?? key);
  }
  // Un filtre posé reste dans sa liste même si la période n'en a plus de deck : sinon on ne pourrait plus le retirer.
  const sources = withSelected(countBy(inPeriod.map((deck) => deck.source)), state.source).map(([value, count]) => ({
    value,
    decks: count,
  }));
  const legends = withSelected(countBy(inPeriod.map(legendKey).filter(Boolean)), state.legend).map(([value, count]) => ({
    value,
    label: legendLabels.get(value) ?? value,
    decks: count,
  }));
  const domains = withSelected(countBy(inPeriod.flatMap((deck) => deck.domains)), state.domain).map(([value]) => value);

  const view: MetaView = {
    t,
    locale,
    basePath,
    state,
    settings,
    sample,
    decks,
    stats,
    stapleSettings,
    stapleNames: new Set(staples.map((stat) => stat.name)),
    catalogTotal: Object.values(sample.setTotals).reduce((sum, count) => sum + count, 0),
    // La tendance n'apparaît que dans le tableau des cartes, et a sa propre fenêtre : la période choisie ne s'y applique pas.
    trends:
      state.tab === "overview" || state.tab === "cards"
        ? computeTrends(filterMetaDecks(sample.decks, { ...state, periodDays: 0 }, now), sample.cards, now)
        : null,
  };

  const latest = sample.decks.reduce((max, deck) => (deck.eventDate > max ? deck.eventDate : max), "");

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {t("summary", { decks: sample.decks.length, date: DateTime.fromISO(latest).setLocale(locale).toLocaleString(DateTime.DATE_MED) })}
      </p>

      <nav aria-label={t("tabs.label")} className="-mx-4 flex gap-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {META_TABS.map((tab) => (
          <Link
            key={tab}
            href={metaHref(basePath, state, settings, { tab, card: tab === "together" || tab === "decks" ? state.card : undefined })}
            scroll={false}
            aria-current={tab === state.tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent py-3 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              tab === state.tab && "border-primary font-semibold text-foreground"
            )}
          >
            {t(`tabs.${tab}`)}
            {tab === "decks" && <span className="ml-1.5 font-mono text-xs">{decks.length}</span>}
          </Link>
        ))}
      </nav>

      <MetaFilters
        basePath={basePath}
        state={state}
        settings={settings}
        periods={periodChoices(settings)}
        sources={sources}
        legends={legends}
        domains={domains}
      />

      {decks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-muted-foreground">
          {t("noMatch")}
        </p>
      ) : (
        <TabContent tab={state.tab} view={view} />
      )}
    </div>
  );
}

function TabContent({ tab, view }: { tab: MetaTab; view: MetaView }) {
  switch (tab) {
    case "cards":
      return <CardsTab view={view} />;
    case "staples":
      return <StaplesTab view={view} groups={computeStapleGroups(view.stats, view.decks, view.stapleSettings)} />;
    case "together": {
      const name = view.state.card ?? view.stats.find((stat) => stat.domains.length > 0)?.name ?? view.stats[0]?.name;
      const associations = name ? computeAssociations(view.decks, view.sample.cards, view.stats, name) : null;
      return <TogetherTab view={view} associations={associations} requested={view.state.card} />;
    }
    case "sets":
      return <SetsTab view={view} sets={computeSetStats(view.decks, view.sample, view.stats, view.stapleSettings)} />;
    case "decks":
      return <DecksTab view={view} />;
    default:
      return <OverviewTab view={view} overview={computeOverview(view.decks, view.sample.cards, view.stats)} />;
  }
}

/** Ajoute la valeur choisie, avec 0 deck, si la liste ne l'a pas. */
function withSelected(entries: [string, number][], selected: string | undefined): [string, number][] {
  return selected && !entries.some(([value]) => value === selected) ? [...entries, [selected, 0]] : entries;
}

/** Les valeurs et leur nombre d'occurrences, les plus fréquentes d'abord. */
function countBy(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
