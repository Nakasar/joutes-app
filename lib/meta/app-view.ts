/**
 * La méta d'un jeu sous forme de données, pour l'application mobile
 * (`GET /api/games/{jeu}/meta` et `…/meta/tournaments/{date}/{slug}`).
 *
 * Mêmes calculs que la page `/games/[jeu]/meta` : seule la mise en forme
 * change. Fonctions pures, testées dans `app-view.test.ts`.
 */

import {
  domainWinrates,
  eventsBetween,
  legendWinrates,
  matchTotals,
  topCutPlayers,
  type MetaEventMatches,
} from "./match-stats";
import { periodChoices } from "./page-params";
import { currentSetPeriod, setPeriods } from "./set-periods";
import type { ResolvedMetaSettings } from "./settings";
import {
  computeCardStats,
  computeOverview,
  filterMetaDecks,
  legendKey,
  legendLabel,
  type MetaSample,
  type MetaSampleDeck,
} from "./stats";
import {
  byPlacement,
  computeTournamentStats,
  findTournamentDecks,
  findTournamentMatches,
  listTournaments,
  tournamentDate,
  tournamentSlug,
} from "./tournaments";

/** Ce que l'app peut demander : la période, une légende, un domaine, un tournoi. */
export type MetaAppParams = {
  periodDays: number;
  legend?: string;
  domain?: string;
  source?: string;
};

const MAX_CARDS = 40;
const MAX_TOURNAMENTS = 40;
const MAX_LEGEND_WINRATES = 40;

function first(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Les paramètres d'une adresse (`period`, `legend`, `domain`, `source`), comme la page. */
export function readMetaAppParams(search: URLSearchParams, settings: ResolvedMetaSettings): MetaAppParams {
  const rawPeriod = first(search.get("period"));
  const period = Number(rawPeriod);
  return {
    periodDays: rawPeriod !== undefined && periodChoices(settings).includes(period) ? period : settings.defaultPeriodDays,
    legend: first(search.get("legend")),
    domain: first(search.get("domain")),
    source: first(search.get("source")),
  };
}

/** Les valeurs et leur nombre d'occurrences, les plus fréquentes d'abord. */
function countBy(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Un filtre posé reste dans sa liste même si la période n'en a plus de deck. */
function withSelected(entries: [string, number][], selected: string | undefined): [string, number][] {
  return selected && !entries.some(([value]) => value === selected) ? [...entries, [selected, 0]] : entries;
}

/** Un deck tel que l'app l'affiche dans une liste : de quoi ouvrir `/decks/{id}`. */
export type MetaAppDeck = {
  id: string;
  name: string;
  legend?: string;
  legendImage?: string;
  domains: string[];
  placement?: string;
  pilot?: string;
  source: string;
  date: string;
};

function appDeck(deck: MetaSampleDeck, sample: MetaSample): MetaAppDeck {
  const image = deck.legendCardId ? sample.cards[deck.legendCardId]?.image : undefined;
  const legend = legendLabel(deck, sample.cards);
  return {
    id: deck.id,
    name: deck.name,
    ...(legend ? { legend } : {}),
    ...(image ? { legendImage: image } : {}),
    domains: deck.domains,
    ...(deck.placement ? { placement: deck.placement } : {}),
    ...(deck.pilot ? { pilot: deck.pilot } : {}),
    source: deck.source,
    date: tournamentDate(deck.eventDate),
  };
}

/** Les winrates des légendes et des domaines sur l'extension en cours (ou tout l'historique sans date de sortie). */
function winratesView(events: MetaEventMatches[], settings: ResolvedMetaSettings, setNames: Record<string, string>, now: Date) {
  if (events.length === 0) return null;
  const today = now.toISOString().slice(0, 10);
  const period = currentSetPeriod(setPeriods(settings.setReleases, setNames), today);
  const counted = eventsBetween(events, period?.from, period?.to);
  return {
    period: period ? { setCode: period.setCode, name: period.name, from: period.from, ...(period.to ? { to: period.to } : {}) } : null,
    totals: matchTotals(counted),
    legends: legendWinrates(counted).slice(0, MAX_LEGEND_WINRATES),
    domains: domainWinrates(counted),
  };
}

/** La vue d'ensemble de la méta, ses filtres, ses cartes, ses tournois et ses winrates. */
export function buildMetaAppView(input: {
  sample: MetaSample;
  events: MetaEventMatches[];
  settings: ResolvedMetaSettings;
  params: MetaAppParams;
  now: Date;
}) {
  const { sample, events, settings, params, now } = input;
  const inPeriod = filterMetaDecks(sample.decks, { periodDays: params.periodDays }, now);
  const decks = filterMetaDecks(sample.decks, params, now);
  const stats = computeCardStats(decks, sample.cards);

  const legendLabels = new Map<string, string>();
  for (const deck of sample.decks) {
    const key = legendKey(deck);
    if (key && !legendLabels.has(key)) legendLabels.set(key, legendLabel(deck, sample.cards) ?? key);
  }
  const latest = sample.decks.reduce((max, deck) => (deck.eventDate > max ? deck.eventDate : max), "");

  return {
    totalDecks: sample.decks.length,
    latestDate: latest ? tournamentDate(latest) : null,
    periods: periodChoices(settings),
    params,
    filters: {
      legends: withSelected(countBy(inPeriod.map(legendKey).filter(Boolean)), params.legend).map(([value, count]) => ({
        value,
        label: legendLabels.get(value) ?? value,
        decks: count,
      })),
      domains: withSelected(countBy(inPeriod.flatMap((deck) => deck.domains)), params.domain).map(([value, count]) => ({
        value,
        decks: count,
      })),
    },
    overview: computeOverview(decks, sample.cards, stats),
    cards: stats.slice(0, MAX_CARDS),
    // Un tournoi se lit en entier : seule la période s'applique à leur liste.
    tournaments: listTournaments(inPeriod, sample.cards).slice(0, MAX_TOURNAMENTS),
    // Les decks récents qui répondent aux filtres, pour en ouvrir un.
    decks: decks
      .slice()
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate) || byPlacement(a, b))
      .slice(0, 30)
      .map((deck) => appDeck(deck, sample)),
    winrates: winratesView(events, settings, sample.setNames, now),
  };
}

export type MetaAppView = ReturnType<typeof buildMetaAppView>;

/** Un tournoi de la méta : ses decks par classement, ses légendes, son top 8 au locator. */
export function buildMetaTournamentAppView(input: {
  sample: MetaSample;
  events: MetaEventMatches[];
  date: string;
  slug: string;
}) {
  const { sample, events, date, slug } = input;
  const decks = findTournamentDecks(sample.decks, date, slug);
  if (decks.length === 0) return null;
  const stats = computeTournamentStats(decks, sample.cards);
  const matches = findTournamentMatches(events, date, slug);

  return {
    source: decks[0].source,
    date,
    slug: tournamentSlug(decks[0].source),
    decks: decks.slice().sort(byPlacement).map((deck) => appDeck(deck, sample)),
    ranked: stats.ranked,
    legends: stats.legends,
    combos: stats.combos.slice(0, 10),
    cardsUp: stats.cardsUp.slice(0, 10),
    cardsDown: stats.cardsDown.slice(0, 10),
    matches: matches
      ? {
          players: matches.players.length,
          totals: matchTotals([matches]),
          topCut: topCutPlayers(matches),
          legends: legendWinrates([matches]).slice(0, MAX_LEGEND_WINRATES),
          ...(matches.url ? { url: matches.url } : {}),
        }
      : null,
  };
}

export type MetaTournamentAppView = NonNullable<ReturnType<typeof buildMetaTournamentAppView>>;
