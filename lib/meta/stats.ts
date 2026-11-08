/**
 * Les statistiques de la méta d'un jeu, en fonctions pures.
 *
 * Tout part d'un échantillon : les decks méta publics du jeu, réduits à ce qui
 * se compte (légende, domaines, cartes), et le catalogue des cartes qu'ils
 * jouent. Le chargement (`lib/meta/load.ts`) est mis en cache par jeu ; les
 * filtres de la page (période, source, légende, domaine) et les calculs
 * tournent ici, à chaque requête, sur quelques centaines de decks au plus.
 *
 * Les cartes se comptent par nom : deux impressions d'une même carte (une
 * réédition, une version alternative) sont la même carte pour un joueur.
 */

export type MetaCard = {
  id: string;
  name: string;
  image?: string;
  type?: string;
  setCode?: string;
  domains: string[];
};

export type MetaSampleDeck = {
  id: string;
  name: string;
  legendCardId?: string;
  legendName?: string;
  domains: string[];
  source: string;
  /** Date du tournoi, ISO. */
  eventDate: string;
  placement?: string;
  pilot?: string;
  coverImage?: string;
  /** Les cartes qui se comptent : ni la légende, ni les runes, ni la réserve. */
  cards: { cardId: string; quantity: number }[];
};

export type MetaSample = {
  decks: MetaSampleDeck[];
  cards: Record<string, MetaCard>;
  /** Nombre de cartes au catalogue, par extension. */
  setTotals: Record<string, number>;
  setNames: Record<string, string>;
};

export type MetaFilters = {
  /** 0 = tout l'échantillon. */
  periodDays: number;
  source?: string;
  legend?: string;
  domain?: string;
};

/** Le nom du groupe des cartes sans domaine : elles se comptent sur tous les decks. */
export const COLORLESS = "Incolore";

const DAY = 24 * 60 * 60 * 1000;

/** Les decks de l'échantillon qui passent les filtres de la page. */
export function filterMetaDecks(decks: MetaSampleDeck[], filters: MetaFilters, now: Date): MetaSampleDeck[] {
  const since = filters.periodDays > 0 ? now.getTime() - filters.periodDays * DAY : undefined;
  return decks.filter(
    (deck) =>
      (since === undefined || new Date(deck.eventDate).getTime() >= since) &&
      (!filters.source || deck.source === filters.source) &&
      (!filters.legend || legendKey(deck) === filters.legend) &&
      (!filters.domain || deck.domains.includes(filters.domain))
  );
}

/** Ce qui identifie la légende d'un deck : sa carte, sinon son nom. */
export function legendKey(deck: Pick<MetaSampleDeck, "legendCardId" | "legendName">): string {
  return deck.legendCardId ?? deck.legendName ?? "";
}

/** Les cartes d'un deck par nom, exemplaires additionnés entre zones et impressions. */
function copiesByName(deck: MetaSampleDeck, cards: Record<string, MetaCard>): Map<string, number> {
  const copies = new Map<string, number>();
  for (const entry of deck.cards) {
    const name = cards[entry.cardId]?.name;
    if (!name) continue;
    copies.set(name, (copies.get(name) ?? 0) + entry.quantity);
  }
  return copies;
}

/** Les decks qui jouent tous les domaines d'une carte ; tous les decks pour une carte incolore. */
function decksInDomains(decks: MetaSampleDeck[], domains: string[]): number {
  if (domains.length === 0) return decks.length;
  return decks.filter((deck) => domains.every((domain) => deck.domains.includes(domain))).length;
}

export type MetaCardStat = {
  name: string;
  cardId: string;
  image?: string;
  type?: string;
  setCode?: string;
  domains: string[];
  /** Decks qui la jouent. */
  decks: number;
  /** Part de tous les decks filtrés. */
  share: number;
  /** Decks qui jouent son ou ses domaines (tous, pour une incolore). */
  domainDecks: number;
  /** Part des decks de son domaine qui la jouent. */
  domainShare: number;
  /** Exemplaires moyens, parmi les decks qui la jouent. */
  averageCopies: number;
};

/** Chaque carte jouée, de la plus jouée à la moins jouée. */
export function computeCardStats(decks: MetaSampleDeck[], cards: Record<string, MetaCard>): MetaCardStat[] {
  const catalog = indexCardsByName(cards);
  const byName = new Map<string, { card: MetaCard; decks: number; copies: number }>();
  for (const deck of decks) {
    for (const [name, copies] of copiesByName(deck, cards)) {
      const entry = byName.get(name);
      if (entry) {
        entry.decks += 1;
        entry.copies += copies;
      } else {
        const card = catalog.get(name);
        if (card) byName.set(name, { card, decks: 1, copies });
      }
    }
  }

  const domainCounts = new Map<string, number>();
  const stats: MetaCardStat[] = [];
  for (const [name, { card, decks: count, copies }] of byName) {
    const key = card.domains.slice().sort().join("|");
    let domainDecks = domainCounts.get(key);
    if (domainDecks === undefined) {
      domainDecks = decksInDomains(decks, card.domains);
      domainCounts.set(key, domainDecks);
    }
    stats.push({
      name,
      cardId: card.id,
      image: card.image,
      type: card.type,
      setCode: card.setCode,
      domains: card.domains,
      decks: count,
      share: decks.length > 0 ? count / decks.length : 0,
      domainDecks,
      domainShare: domainDecks > 0 ? count / domainDecks : 0,
      averageCopies: count > 0 ? copies / count : 0,
    });
  }

  return stats.sort((a, b) => b.decks - a.decks || b.domainShare - a.domainShare || a.name.localeCompare(b.name));
}

/** La fenêtre de la tendance, en jours, et le minimum de decks de chaque côté pour l'afficher. */
export const TREND_WINDOW_DAYS = 30;
export const TREND_MIN_DECKS = 5;

/**
 * La tendance de chaque carte : sa part des decks sur les 30 derniers jours,
 * moins sa part sur les 30 jours d'avant, en fraction (0,09 = +9 points).
 *
 * Elle ignore la période choisie (elle a la sienne) mais suit les autres
 * filtres, que l'appelant a déjà appliqués. Sans assez de decks d'un côté,
 * rien : un écart sur trois decks ne dit rien.
 */
export function computeTrends(
  decks: MetaSampleDeck[],
  cards: Record<string, MetaCard>,
  now: Date,
  windowDays = TREND_WINDOW_DAYS,
  minDecks = TREND_MIN_DECKS
): Map<string, number> | null {
  const end = now.getTime();
  const middle = end - windowDays * DAY;
  const start = middle - windowDays * DAY;
  const recent: MetaSampleDeck[] = [];
  const before: MetaSampleDeck[] = [];
  for (const deck of decks) {
    const time = new Date(deck.eventDate).getTime();
    if (time >= middle && time <= end) recent.push(deck);
    else if (time >= start && time < middle) before.push(deck);
  }
  if (recent.length < minDecks || before.length < minDecks) return null;

  const share = (sample: MetaSampleDeck[]) => {
    const counts = new Map<string, number>();
    for (const deck of sample) for (const name of copiesByName(deck, cards).keys()) counts.set(name, (counts.get(name) ?? 0) + 1);
    return counts;
  };
  const recentCounts = share(recent);
  const beforeCounts = share(before);
  const trends = new Map<string, number>();
  for (const name of new Set([...recentCounts.keys(), ...beforeCounts.keys()])) {
    trends.set(name, (recentCounts.get(name) ?? 0) / recent.length - (beforeCounts.get(name) ?? 0) / before.length);
  }
  return trends;
}

/** Le catalogue de l'échantillon réduit à une fiche par nom : la première rencontrée. */
export function indexCardsByName(cards: Record<string, MetaCard>): Map<string, MetaCard> {
  const byName = new Map<string, MetaCard>();
  for (const card of Object.values(cards)) {
    if (!byName.has(card.name)) byName.set(card.name, card);
  }
  return byName;
}

export type StapleSettings = { threshold: number; minDecks: number };

export function isStaple(stat: MetaCardStat, settings: StapleSettings): boolean {
  return stat.domainDecks >= settings.minDecks && stat.domainShare >= settings.threshold;
}

export type StapleGroup = {
  /** « Fury », « Fury + Chaos », ou `COLORLESS`. */
  key: string;
  domains: string[];
  /** Decks qui jouent ces domaines. */
  decks: number;
  /** Trop peu de decks pour conclure : pas de staples. */
  tooFew: boolean;
  staples: MetaCardStat[];
  /** Jouées par au moins 15 points de moins que le seuil, sans l'atteindre. */
  nearMisses: MetaCardStat[];
};

const NEAR_MISS_MARGIN = 0.15;

/**
 * Les staples, rangées par domaine. Une carte à deux domaines forme le groupe
 * de sa paire ; une carte incolore, le groupe « Incolore », compté sur tous
 * les decks. Les domaines seuls d'abord, des plus joués aux moins joués, puis
 * les paires, puis les incolores.
 */
export function computeStapleGroups(
  stats: MetaCardStat[],
  decks: MetaSampleDeck[],
  settings: StapleSettings
): StapleGroup[] {
  const groups = new Map<string, StapleGroup>();
  const groupFor = (domains: string[]): StapleGroup => {
    const sorted = domains.slice().sort((a, b) => a.localeCompare(b));
    const key = sorted.length === 0 ? COLORLESS : sorted.join(" + ");
    let group = groups.get(key);
    if (!group) {
      const count = decksInDomains(decks, sorted);
      group = { key, domains: sorted, decks: count, tooFew: count < settings.minDecks, staples: [], nearMisses: [] };
      groups.set(key, group);
    }
    return group;
  };

  // Chaque domaine joué a son groupe, même sans staple : « 0 staple sur
  // 42 decks » se lit aussi.
  for (const domain of new Set(decks.flatMap((deck) => deck.domains))) groupFor([domain]);

  for (const stat of stats) {
    if (isStaple(stat, settings)) {
      groupFor(stat.domains).staples.push(stat);
    } else if (stat.domainDecks >= settings.minDecks && stat.domainShare >= settings.threshold - NEAR_MISS_MARGIN) {
      groupFor(stat.domains).nearMisses.push(stat);
    }
  }

  const rank = (group: StapleGroup) => (group.domains.length === 0 ? 2 : group.domains.length === 1 ? 0 : 1);
  return [...groups.values()]
    // Un domaine seul s'affiche toujours ; une paire ou les incolores, seulement s'ils ont quelque chose à montrer.
    .filter((group) => group.domains.length === 1 || group.staples.length > 0 || group.nearMisses.length > 0)
    .map((group) => ({
      ...group,
      staples: group.staples.sort((a, b) => b.domainShare - a.domainShare || a.name.localeCompare(b.name)),
      nearMisses: group.nearMisses.sort((a, b) => b.domainShare - a.domainShare).slice(0, 5),
    }))
    .sort((a, b) => rank(a) - rank(b) || b.decks - a.decks || a.key.localeCompare(b.key));
}

export type LegendStat = {
  key: string;
  name: string;
  cardId?: string;
  image?: string;
  domains: string[];
  decks: number;
  share: number;
  /** Decks de la légende classés dans un top 8. */
  topCuts: number;
};

/** Un classement dans un top 8 : « 1er », « 3e-4e », « Top 8 ». */
export function isTopCut(placement: string | undefined): boolean {
  if (!placement) return false;
  const top = placement.match(/top\s*(\d+)/i);
  if (top) return Number(top[1]) <= 8;
  const rank = placement.match(/\d+/);
  return rank ? Number(rank[0]) <= 8 : false;
}

export type MetaOverview = {
  decks: number;
  sources: number;
  legends: LegendStat[];
  /** Part des decks tenue par les huit légendes les plus jouées. */
  topLegendsShare: number;
  domains: { domain: string; decks: number; share: number }[];
  topPair?: { domains: [string, string]; decks: number; share: number };
  /** Cartes différentes jouées, par nom. */
  cardsPlayed: number;
};

export function computeOverview(
  decks: MetaSampleDeck[],
  cards: Record<string, MetaCard>,
  stats: MetaCardStat[]
): MetaOverview {
  const total = decks.length;
  const share = (count: number) => (total > 0 ? count / total : 0);

  const legends = new Map<string, LegendStat>();
  for (const deck of decks) {
    const key = legendKey(deck);
    if (!key) continue;
    let legend = legends.get(key);
    if (!legend) {
      const card = deck.legendCardId ? cards[deck.legendCardId] : undefined;
      legend = {
        key,
        name: card?.name ?? deck.legendName ?? key,
        cardId: deck.legendCardId,
        image: card?.image,
        domains: card?.domains.length ? card.domains : deck.domains,
        decks: 0,
        share: 0,
        topCuts: 0,
      };
      legends.set(key, legend);
    }
    legend.decks += 1;
    if (isTopCut(deck.placement)) legend.topCuts += 1;
  }
  const legendList = [...legends.values()]
    .map((legend) => ({ ...legend, share: share(legend.decks) }))
    .sort((a, b) => b.decks - a.decks || a.name.localeCompare(b.name));

  const domainCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  for (const deck of decks) {
    const domains = [...new Set(deck.domains)].sort((a, b) => a.localeCompare(b));
    for (const domain of domains) domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    for (let i = 0; i < domains.length; i += 1) {
      for (let j = i + 1; j < domains.length; j += 1) {
        const key = `${domains[i]}|${domains[j]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const [pairKey, pairDecks] = [...pairCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];

  return {
    decks: total,
    sources: new Set(decks.map((deck) => deck.source)).size,
    legends: legendList,
    topLegendsShare: share(legendList.slice(0, 8).reduce((sum, legend) => sum + legend.decks, 0)),
    domains: [...domainCounts.entries()]
      .map(([domain, count]) => ({ domain, decks: count, share: share(count) }))
      .sort((a, b) => b.decks - a.decks || a.domain.localeCompare(b.domain)),
    ...(pairKey && pairDecks
      ? { topPair: { domains: pairKey.split("|") as [string, string], decks: pairDecks, share: share(pairDecks) } }
      : {}),
    cardsPlayed: stats.length,
  };
}

export type AssociationStat = {
  name: string;
  cardId: string;
  image?: string;
  /** Decks qui jouent les deux cartes. */
  together: number;
  /** Part des decks de la carte choisie qui jouent celle-ci. */
  withShare: number;
  /** Part de tous les decks qui jouent celle-ci. */
  baseShare: number;
  /** withShare / baseShare : au-dessus de 1, elles vont ensemble. */
  lift: number;
};

export type CardAssociations = {
  card: MetaCardStat;
  /** Les légendes des decks qui la jouent, les plus fréquentes d'abord. */
  legends: { name: string; share: number }[];
  often: AssociationStat[];
  rarely: AssociationStat[];
};

/** Part minimale des decks de la carte choisie pour parler d'une association. */
const MIN_WITH_SHARE = 0.3;
/** Part minimale de tous les decks pour qu'une absence soit parlante. */
const MIN_BASE_SHARE_FOR_RARELY = 0.2;

/**
 * Les cartes jouées avec une carte : la part des decks de la carte qui les
 * jouent, comparée à leur part habituelle. Une carte jouée partout (une
 * staple incolore) a un écart proche de 1 : elle n'est pas « associée ».
 */
export function computeAssociations(
  decks: MetaSampleDeck[],
  cards: Record<string, MetaCard>,
  stats: MetaCardStat[],
  cardName: string
): CardAssociations | null {
  const card = stats.find((stat) => stat.name === cardName);
  if (!card) return null;

  const names = decks.map((deck) => new Set(copiesByName(deck, cards).keys()));
  const withIndexes = names.flatMap((set, index) => (set.has(cardName) ? [index] : []));
  if (withIndexes.length === 0) return null;

  const together = new Map<string, number>();
  for (const index of withIndexes) {
    for (const name of names[index]) {
      if (name !== cardName) together.set(name, (together.get(name) ?? 0) + 1);
    }
  }

  const associations: AssociationStat[] = stats
    .filter((stat) => stat.name !== cardName)
    .map((stat) => {
      const count = together.get(stat.name) ?? 0;
      const withShare = count / withIndexes.length;
      return {
        name: stat.name,
        cardId: stat.cardId,
        image: stat.image,
        together: count,
        withShare,
        baseShare: stat.share,
        lift: stat.share > 0 ? withShare / stat.share : 0,
      };
    });

  const legendCounts = new Map<string, number>();
  for (const index of withIndexes) {
    const deck = decks[index];
    const name = (deck.legendCardId && cards[deck.legendCardId]?.name) || deck.legendName;
    if (name) legendCounts.set(name, (legendCounts.get(name) ?? 0) + 1);
  }

  return {
    card,
    legends: [...legendCounts.entries()]
      .map(([name, count]) => ({ name, share: count / withIndexes.length }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 3),
    often: associations
      .filter((item) => item.withShare >= MIN_WITH_SHARE && item.lift > 1)
      .sort((a, b) => b.lift - a.lift || b.withShare - a.withShare)
      .slice(0, 15),
    rarely: associations
      .filter((item) => item.baseShare >= MIN_BASE_SHARE_FOR_RARELY && item.lift <= 0.5)
      .sort((a, b) => a.lift - b.lift || b.baseShare - a.baseShare)
      .slice(0, 6),
  };
}

export type SetStat = {
  setCode: string;
  name: string;
  /** Part des exemplaires joués qui viennent de l'extension. */
  copiesShare: number;
  staples: number;
  /** Cartes différentes de l'extension jouées. */
  played: number;
  /** Cartes de l'extension au catalogue. */
  total?: number;
  topCards: MetaCardStat[];
  /** Staples par domaine (une carte à deux domaines compte dans chacun ; `COLORLESS` pour les incolores). */
  staplesByDomain: Record<string, number>;
};

/**
 * Les extensions dans la méta. Les exemplaires se rangent sous l'extension de
 * l'impression jouée ; une carte (un nom) sous celle de la fiche retenue par
 * `computeCardStats`, la première rencontrée.
 */
export function computeSetStats(
  decks: MetaSampleDeck[],
  sample: Pick<MetaSample, "cards" | "setTotals" | "setNames">,
  stats: MetaCardStat[],
  settings: StapleSettings
): SetStat[] {
  const copies = new Map<string, number>();
  let allCopies = 0;
  for (const deck of decks) {
    for (const entry of deck.cards) {
      const setCode = sample.cards[entry.cardId]?.setCode;
      if (!setCode) continue;
      copies.set(setCode, (copies.get(setCode) ?? 0) + entry.quantity);
      allCopies += entry.quantity;
    }
  }

  const sets = new Map<string, SetStat>();
  const setFor = (setCode: string): SetStat => {
    let set = sets.get(setCode);
    if (!set) {
      set = {
        setCode,
        name: sample.setNames[setCode] ?? setCode,
        copiesShare: allCopies > 0 ? (copies.get(setCode) ?? 0) / allCopies : 0,
        staples: 0,
        played: 0,
        ...(sample.setTotals[setCode] ? { total: sample.setTotals[setCode] } : {}),
        topCards: [],
        staplesByDomain: {},
      };
      sets.set(setCode, set);
    }
    return set;
  };

  for (const setCode of copies.keys()) setFor(setCode);
  for (const stat of stats) {
    if (!stat.setCode) continue;
    const set = setFor(stat.setCode);
    set.played += 1;
    if (set.topCards.length < 3) set.topCards.push(stat);
    if (isStaple(stat, settings)) {
      set.staples += 1;
      for (const domain of stat.domains.length > 0 ? stat.domains : [COLORLESS]) {
        set.staplesByDomain[domain] = (set.staplesByDomain[domain] ?? 0) + 1;
      }
    }
  }

  return [...sets.values()].sort((a, b) => b.copiesShare - a.copiesShare || a.setCode.localeCompare(b.setCode));
}
