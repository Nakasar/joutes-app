/**
 * La méta d'un tournoi, en fonctions pures.
 *
 * Un tournoi, ce sont les decks méta de même source (« RC Europe 2026 ») et de
 * même date : deux « Regional Lyon » à des dates différentes font deux
 * tournois. Son adresse porte la date et la source simplifiée :
 * `/games/riftbound/meta/tournois/2026-11-09/rc-europe-2026`.
 *
 * Le classement est saisi librement (« 1er », « 3e-4e », « Top 8 »,
 * « 9e-16e ») : il se lit par son premier nombre, « Top N » valant N.
 */

import { legendKey, legendLabel, type MetaCard, type MetaSampleDeck } from "./stats.ts";

/**
 * Le jour d'un tournoi, `AAAA-MM-JJ`, tel que la date a été saisie (minuit UTC).
 *
 * Lu sur la date ISO plutôt qu'avec luxon : luxon consulte l'heure courante en
 * analysant une date, ce que Next refuse pendant le rendu statique des
 * métadonnées.
 */
export function tournamentDate(eventDate: string | Date): string {
  const date = typeof eventDate === "string" ? new Date(eventDate) : eventDate;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** La source réduite à des lettres sans accents, des chiffres et des tirets : « RC Europe 2026 » donne « rc-europe-2026 ». */
export function tournamentSlug(source: string): string {
  const slug = source
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "tournoi";
}

/** L'adresse de la page d'un tournoi, sous la méta du jeu (`/games/<jeu>/meta`). */
export function tournamentPath(metaPath: string, source: string, eventDate: string | Date): string {
  return `${metaPath}/tournois/${tournamentDate(eventDate)}/${tournamentSlug(source)}`;
}

/** Les decks d'un tournoi, retrouvés par sa date et sa source simplifiée. */
export function findTournamentDecks(decks: MetaSampleDeck[], date: string, slug: string): MetaSampleDeck[] {
  return decks.filter((deck) => tournamentDate(deck.eventDate) === date && tournamentSlug(deck.source) === slug);
}

/** Le rang lu dans un classement : « 3e-4e » donne 3, « Top 8 » donne 8 ; rien sans nombre. */
export function placementRank(placement: string | undefined): number | undefined {
  if (!placement) return undefined;
  const top = placement.match(/top\s*(\d+)/i);
  if (top) return Number(top[1]);
  const rank = placement.match(/\d+/);
  return rank ? Number(rank[0]) : undefined;
}

export const PLACEMENT_TIERS = ["top8", "top16", "top32", "rest", "unranked"] as const;
export type PlacementTier = (typeof PLACEMENT_TIERS)[number];

/** Le palier d'un classement : Top 8, 9e-16e, 17e-32e, au-delà, ou sans classement. */
export function placementTier(placement: string | undefined): PlacementTier {
  const rank = placementRank(placement);
  if (rank === undefined) return "unranked";
  if (rank <= 8) return "top8";
  if (rank <= 16) return "top16";
  if (rank <= 32) return "top32";
  return "rest";
}

/** Trie des decks par classement, les decks sans classement à la fin. */
export function byPlacement(a: Pick<MetaSampleDeck, "placement" | "name">, b: Pick<MetaSampleDeck, "placement" | "name">): number {
  const ra = placementRank(a.placement) ?? Number.MAX_SAFE_INTEGER;
  const rb = placementRank(b.placement) ?? Number.MAX_SAFE_INTEGER;
  return ra - rb || a.name.localeCompare(b.name);
}

export type TournamentSummary = {
  source: string;
  /** `AAAA-MM-JJ`. */
  date: string;
  slug: string;
  decks: number;
  /** Le deck classé premier, s'il y en a un. */
  winner?: { deckId: string; legend?: string; pilot?: string };
  topLegend?: { name: string; decks: number; share: number };
  /** Les deux domaines les plus joués, en part des decks. */
  topDomains: { domain: string; share: number }[];
};

/** Les tournois d'un échantillon, les plus récents d'abord. */
export function listTournaments(decks: MetaSampleDeck[], cards: Record<string, MetaCard>): TournamentSummary[] {
  const groups = new Map<string, MetaSampleDeck[]>();
  for (const deck of decks) {
    const key = `${tournamentDate(deck.eventDate)}|${tournamentSlug(deck.source)}`;
    const group = groups.get(key);
    if (group) group.push(deck);
    else groups.set(key, [deck]);
  }

  return [...groups.values()]
    .map((group) => {
      const first = group[0];
      const winner = group.find((deck) => placementRank(deck.placement) === 1);
      const legends = countBy(group.map(legendKey).filter(Boolean));
      const [legendKeyValue, legendDecks] = legends[0] ?? [];
      const legendDeck = legendKeyValue ? group.find((deck) => legendKey(deck) === legendKeyValue) : undefined;
      return {
        source: first.source,
        date: tournamentDate(first.eventDate),
        slug: tournamentSlug(first.source),
        decks: group.length,
        ...(winner
          ? { winner: { deckId: winner.id, legend: legendLabel(winner, cards), ...(winner.pilot ? { pilot: winner.pilot } : {}) } }
          : {}),
        ...(legendDeck && legendDecks
          ? { topLegend: { name: legendLabel(legendDeck, cards) ?? legendKeyValue!, decks: legendDecks, share: legendDecks / group.length } }
          : {}),
        topDomains: countBy(group.flatMap((deck) => [...new Set(deck.domains)]))
          .slice(0, 2)
          .map(([domain, count]) => ({ domain, share: count / group.length })),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.source.localeCompare(b.source));
}

export type TournamentLegend = {
  key: string;
  name: string;
  image?: string;
  domains: string[];
  decks: number;
  /** Part des decks du tournoi. */
  share: number;
  /** Decks classés dans le top 8. */
  topCuts: number;
  /** Part du top 8. */
  topShare: number;
  /** Le meilleur classement saisi. */
  best?: string;
  /** Part du top 8 ÷ part du tournoi ; absente sans top 8. */
  conversion?: number;
};

export type TournamentDomain = {
  domain: string;
  /** Decks qui jouent le domaine. */
  decks: number;
  /** Part des emplacements de domaine : chaque deck compte pour chacun de ses domaines. */
  slotShare: number;
  topDecks: number;
  topSlotShare: number;
};

export type TournamentCardDiff = {
  name: string;
  cardId: string;
  image?: string;
  /** Part des decks du top 8 qui la jouent. */
  top: number;
  /** Part des autres decks qui la jouent. */
  rest: number;
};

export type TournamentStats = {
  decks: number;
  /** Decks dont le classement se lit. */
  ranked: number;
  legends: TournamentLegend[];
  domains: TournamentDomain[];
  pairs: { domains: [string, string]; decks: number }[];
  topCut: MetaSampleDeck[];
  /** Les paliers présents, dans l'ordre, et leur nombre de decks. */
  tiers: { tier: PlacementTier; decks: number }[];
  /** Pour chaque légende (dans l'ordre de `legends`), ses decks par palier de `tiers`. */
  matrix: Record<string, number[]>;
  /** Cartes que le top 8 joue nettement plus, ou moins, que le reste. */
  cardsUp: TournamentCardDiff[];
  cardsDown: TournamentCardDiff[];
};

/** Écart minimal entre top 8 et reste pour qu'une carte « fasse la différence ». */
export const CARD_DIFF_MIN = 0.15;
/** Decks minimum de chaque côté pour comparer le top 8 au reste. */
export const CARD_DIFF_MIN_DECKS = 4;
const CARD_DIFF_LIMIT = 5;

export function computeTournamentStats(decks: MetaSampleDeck[], cards: Record<string, MetaCard>): TournamentStats {
  const total = decks.length;
  const topCut = decks.filter((deck) => placementTier(deck.placement) === "top8").sort(byPlacement);
  const topIds = new Set(topCut.map((deck) => deck.id));

  // Les légendes.
  const legends = new Map<string, TournamentLegend & { bestRank: number }>();
  for (const deck of decks) {
    const key = legendKey(deck);
    if (!key) continue;
    let legend = legends.get(key);
    if (!legend) {
      const card = deck.legendCardId ? cards[deck.legendCardId] : undefined;
      legend = {
        key,
        name: legendLabel(deck, cards) ?? key,
        ...(card?.image ? { image: card.image } : {}),
        domains: card?.domains.length ? card.domains : deck.domains,
        decks: 0,
        share: 0,
        topCuts: 0,
        topShare: 0,
        bestRank: Number.MAX_SAFE_INTEGER,
      };
      legends.set(key, legend);
    }
    legend.decks += 1;
    if (topIds.has(deck.id)) legend.topCuts += 1;
    const rank = placementRank(deck.placement);
    if (rank !== undefined && rank < legend.bestRank) {
      legend.bestRank = rank;
      legend.best = deck.placement;
    }
  }
  const legendList: TournamentLegend[] = [...legends.values()]
    .map(({ bestRank: _bestRank, ...legend }) => {
      const share = total > 0 ? legend.decks / total : 0;
      const topShare = topCut.length > 0 ? legend.topCuts / topCut.length : 0;
      return { ...legend, share, topShare, ...(topCut.length > 0 && share > 0 ? { conversion: topShare / share } : {}) };
    })
    .sort((a, b) => b.decks - a.decks || b.topCuts - a.topCuts || a.name.localeCompare(b.name));

  // Les domaines : chaque deck compte pour chacun de ses domaines.
  const domainCounts = new Map<string, { decks: number; top: number }>();
  const pairCounts = new Map<string, number>();
  let slots = 0;
  let topSlots = 0;
  for (const deck of decks) {
    const domains = [...new Set(deck.domains)].sort((a, b) => a.localeCompare(b));
    const isTop = topIds.has(deck.id);
    for (const domain of domains) {
      const entry = domainCounts.get(domain) ?? { decks: 0, top: 0 };
      entry.decks += 1;
      slots += 1;
      if (isTop) {
        entry.top += 1;
        topSlots += 1;
      }
      domainCounts.set(domain, entry);
    }
    for (let i = 0; i < domains.length; i += 1) {
      for (let j = i + 1; j < domains.length; j += 1) {
        const key = `${domains[i]}|${domains[j]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const domainList = [...domainCounts.entries()]
    .map(([domain, { decks: count, top }]) => ({
      domain,
      decks: count,
      slotShare: slots > 0 ? count / slots : 0,
      topDecks: top,
      topSlotShare: topSlots > 0 ? top / topSlots : 0,
    }))
    .sort((a, b) => b.decks - a.decks || a.domain.localeCompare(b.domain));
  const pairs = [...pairCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([key, count]) => ({ domains: key.split("|") as [string, string], decks: count }));

  // Les paliers de classement présents, et les légendes dans chacun.
  const tierCounts = new Map<PlacementTier, number>();
  for (const deck of decks) {
    const tier = placementTier(deck.placement);
    tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
  }
  const tiers = PLACEMENT_TIERS.filter((tier) => tierCounts.has(tier)).map((tier) => ({ tier, decks: tierCounts.get(tier)! }));
  const matrix: Record<string, number[]> = {};
  for (const legend of legendList) matrix[legend.key] = tiers.map(() => 0);
  for (const deck of decks) {
    const row = matrix[legendKey(deck)];
    if (row) row[tiers.findIndex(({ tier }) => tier === placementTier(deck.placement))] += 1;
  }

  // Les cartes qui séparent le top 8 du reste.
  const rest = decks.filter((deck) => !topIds.has(deck.id));
  let cardsUp: TournamentCardDiff[] = [];
  let cardsDown: TournamentCardDiff[] = [];
  if (topCut.length >= CARD_DIFF_MIN_DECKS && rest.length >= CARD_DIFF_MIN_DECKS) {
    const topCounts = countCardNames(topCut, cards);
    const restCounts = countCardNames(rest, cards);
    const names = new Set([...topCounts.keys(), ...restCounts.keys()]);
    const diffs: TournamentCardDiff[] = [];
    for (const name of names) {
      const top = (topCounts.get(name)?.decks ?? 0) / topCut.length;
      const restShare = (restCounts.get(name)?.decks ?? 0) / rest.length;
      const card = topCounts.get(name)?.card ?? restCounts.get(name)!.card;
      diffs.push({ name, cardId: card.id, ...(card.image ? { image: card.image } : {}), top, rest: restShare });
    }
    cardsUp = diffs
      .filter((diff) => diff.top - diff.rest >= CARD_DIFF_MIN)
      .sort((a, b) => b.top - b.rest - (a.top - a.rest) || a.name.localeCompare(b.name))
      .slice(0, CARD_DIFF_LIMIT);
    cardsDown = diffs
      .filter((diff) => diff.rest - diff.top >= CARD_DIFF_MIN)
      .sort((a, b) => b.rest - b.top - (a.rest - a.top) || a.name.localeCompare(b.name))
      .slice(0, CARD_DIFF_LIMIT);
  }

  return {
    decks: total,
    ranked: decks.filter((deck) => placementRank(deck.placement) !== undefined).length,
    legends: legendList,
    domains: domainList,
    pairs,
    topCut,
    tiers,
    matrix,
    cardsUp,
    cardsDown,
  };
}

/** Pour chaque carte (par nom), le nombre de decks qui la jouent. */
function countCardNames(decks: MetaSampleDeck[], cards: Record<string, MetaCard>): Map<string, { card: MetaCard; decks: number }> {
  const counts = new Map<string, { card: MetaCard; decks: number }>();
  for (const deck of decks) {
    const seen = new Set<string>();
    for (const entry of deck.cards) {
      const card = cards[entry.cardId];
      if (!card || seen.has(card.name)) continue;
      seen.add(card.name);
      const current = counts.get(card.name);
      if (current) current.decks += 1;
      else counts.set(card.name, { card, decks: 1 });
    }
  }
  return counts;
}

/** Les valeurs et leur nombre d'occurrences, les plus fréquentes d'abord. */
function countBy(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
