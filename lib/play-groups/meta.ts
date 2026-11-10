import { computeOverview, legendKey, type MetaCard, type MetaOverview, type MetaSampleDeck } from "@/lib/meta/stats";
import { emptyRecord, recordMatches, winrate, type MatchRecord, type MetaEventMatches } from "@/lib/meta/match-stats";
import { tournamentKey } from "@/lib/tournaments/results";
import type { TournamentResult } from "@/lib/types/TournamentResult";

/**
 * La méta d'un groupe de jeu (`?view=meta`), en fonctions pures.
 *
 * L'échantillon est fait des participations des membres actuels à des
 * tournois (`tournamentResults`), toute leur histoire comprise : chaque
 * résultat devient un deck d'échantillon de la méta (`MetaSampleDeck`), si
 * bien que les calculs de `lib/meta` s'appliquent tels quels. Les winrates
 * viennent des bilans des résultats ; les confrontations, des matchs connus
 * (tournois Joutes et tournois importés du locator).
 */

type SearchParamValue = string | string[] | undefined;

function single(value: SearchParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();

  return trimmed ? trimmed : undefined;
}

export const GROUP_META_TABS = ["overview", "legends", "members", "matchups", "cards"] as const;
export type GroupMetaTab = (typeof GROUP_META_TABS)[number];

/** Les onglets dans l'adresse, en français comme les autres filtres du groupe. */
const TAB_PARAMS: Record<GroupMetaTab, string | undefined> = {
  overview: undefined,
  legends: "legendes",
  members: "membres",
  matchups: "confrontations",
  cards: "cartes",
};

/** « Toute l'histoire » plutôt que l'extension en cours. */
export const ALL_PERIODS = "tout";

/** Sous ce nombre de matchs, un winrate du groupe ne s'affiche pas : un groupe joue moins qu'une méta. */
export const MIN_GROUP_MATCHES_FOR_RATE = 10;

export type GroupMetaParams = {
  gameId?: string;
  tab: GroupMetaTab;
  /** Le code d'une extension, `tout`, ou rien : l'extension en cours. */
  ext?: string;
  userId?: string;
  /** Comparer à la méta du jeu : oui par défaut, `comparer=0` l'éteint. */
  compare: boolean;
};

export function readGroupMetaParams(params: Record<string, SearchParamValue>): GroupMetaParams {
  const tabParam = single(params.onglet);
  const tab = (Object.entries(TAB_PARAMS).find(([, value]) => value && value === tabParam)?.[0] ?? "overview") as GroupMetaTab;
  const gameId = single(params.jeu);
  const ext = single(params.ext);
  const userId = single(params.membre);

  return {
    tab,
    compare: single(params.comparer) !== "0",
    ...(gameId ? { gameId } : {}),
    ...(ext && /^[A-Za-z0-9_-]{1,24}$/.test(ext) ? { ext } : {}),
    ...(userId ? { userId } : {}),
  };
}

/** Les paramètres en filtres d'adresse, pour `viewHref`. */
export function groupMetaFilterParams(params: GroupMetaParams): Record<string, string | undefined> {
  return {
    jeu: params.gameId,
    onglet: TAB_PARAMS[params.tab],
    ext: params.ext,
    membre: params.userId,
    comparer: params.compare ? undefined : "0",
  };
}

/** Ce que la méta lit d'un résultat. */
export type GroupMetaResult = Pick<
  TournamentResult,
  | "id"
  | "userId"
  | "gameId"
  | "source"
  | "tournamentRef"
  | "name"
  | "date"
  | "placement"
  | "record"
  | "deckId"
  | "legendCardId"
  | "legendName"
  | "domains"
>;

/** Ce qui tombe dans une période, bornes comprises (`AAAA-MM-JJ`), d'après une date ISO. */
export function between<T>(items: T[], dateOf: (item: T) => string, from?: string, to?: string): T[] {
  return items.filter((item) => {
    const day = dateOf(item).slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  });
}

/** Les résultats (ou les matchs) d'une période, bornes comprises. */
export function resultsBetween<T extends Pick<TournamentResult, "date">>(results: T[], from?: string, to?: string): T[] {
  return between(results, (result) => result.date, from, to);
}

/**
 * Un résultat en deck d'échantillon : sa légende, ses domaines, sa date, son
 * classement, et les cartes du deck lié quand il y en a un. Le tournoi tient
 * lieu de source, le membre de pilote.
 */
export function toSampleDeck(result: GroupMetaResult, cards: MetaSampleDeck["cards"] = []): MetaSampleDeck {
  return {
    id: result.id,
    name: result.name,
    ...(result.legendCardId ? { legendCardId: result.legendCardId } : {}),
    ...(result.legendName ? { legendName: result.legendName } : {}),
    domains: result.domains ?? [],
    source: tournamentKey(result),
    eventDate: result.date,
    ...(result.placement !== undefined ? { placement: String(result.placement) } : {}),
    pilot: result.userId,
    cards,
  };
}

function addRecord(total: MatchRecord, record: TournamentResult["record"]) {
  if (!record) return;
  total.wins += record.wins;
  total.losses += record.losses;
  total.draws += record.draws;
}

/** Un winrate seulement sur assez de matchs. */
export function groupRate(record: MatchRecord): number | undefined {
  return recordMatches(record) >= MIN_GROUP_MATCHES_FOR_RATE ? winrate(record) : undefined;
}

export type GroupLegendRow = MetaOverview["legends"][number] &
  MatchRecord & {
    matches: number;
    rate?: number;
    /** Les membres qui l'ont jouée, du plus fidèle au moins fidèle. */
    userIds: string[];
    /** Sa part dans la méta du jeu, quand on compare. */
    metaShare?: number;
  };

export type GroupDomainRow = MetaOverview["domains"][number] & { metaShare?: number };

export type GroupMemberRow = MatchRecord & {
  userId: string;
  tournaments: number;
  topEights: number;
  best?: number;
  matches: number;
  rate?: number;
  /** Les légendes jouées, de la plus jouée à la moins jouée. */
  legends: string[];
  last?: { name: string; date: string; placement?: number };
};

export type GroupMetaTotals = MatchRecord & {
  participations: number;
  tournaments: number;
  members: number;
  topEights: number;
  matches: number;
  rate?: number;
  latest?: string;
};

/** Ce qui sert de repère : la part de chaque légende et de chaque domaine dans la méta du jeu. */
export type MetaReference = {
  legendShare: (legend: { cardId?: string; name: string }) => number | undefined;
  domainShare: (domain: string) => number | undefined;
  pair?: [string, string];
};

function normalizeLegend(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Le nom court d'une légende, normalisé : « Kai'Sa, Daughter of the Void »
 * et « kai'sa » sont la même. Le locator et une saisie à la main ne donnent
 * souvent que le champion.
 */
function legendShortKey(name: string): string {
  return normalizeLegend(name.split(",")[0]);
}

/** Le repère de la méta du jeu : une légende se retrouve par sa carte, sinon par son nom. */
export function metaReference(overview: MetaOverview): MetaReference {
  const byCard = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const legend of overview.legends) {
    if (legend.cardId) byCard.set(legend.cardId, legend.share);
    byName.set(normalizeLegend(legend.name), legend.share);
    // « Kai'Sa, Daughter of the Void » et « Kai'Sa » sont la même légende.
    const short = legendShortKey(legend.name);
    if (!byName.has(short)) byName.set(short, legend.share);
  }
  const domains = new Map(overview.domains.map((domain) => [domain.domain, domain.share]));

  return {
    legendShare: ({ cardId, name }) =>
      (cardId ? byCard.get(cardId) : undefined) ??
      byName.get(normalizeLegend(name)) ??
      byName.get(legendShortKey(name)) ??
      (overview.decks > 0 ? 0 : undefined),
    domainShare: (domain) => domains.get(domain) ?? (overview.decks > 0 ? 0 : undefined),
    ...(overview.topPair ? { pair: overview.topPair.domains } : {}),
  };
}

/**
 * Une légende saisie par son nom seul (un résultat déclaré) reprend la carte
 * d'un autre résultat qui porte le même nom : elle ne fait qu'une ligne.
 */
export function harmonizeLegends<T extends GroupMetaResult>(results: T[]): T[] {
  const cardByName = new Map<string, string>();
  const cardByShort = new Map<string, string>();
  for (const result of results) {
    if (!result.legendCardId || !result.legendName) continue;
    cardByName.set(normalizeLegend(result.legendName), result.legendCardId);
    cardByShort.set(legendShortKey(result.legendName), result.legendCardId);
  }
  return results.map((result) => {
    if (result.legendCardId || !result.legendName) return result;
    const cardId = cardByName.get(normalizeLegend(result.legendName)) ?? cardByShort.get(legendShortKey(result.legendName));
    return cardId ? { ...result, legendCardId: cardId } : result;
  });
}

export type GroupMeta = {
  totals: GroupMetaTotals;
  overview: MetaOverview;
  legends: GroupLegendRow[];
  domains: GroupDomainRow[];
  members: GroupMemberRow[];
};

/**
 * La méta d'un groupe sur un ensemble de résultats : la vue d'ensemble de
 * `computeOverview`, enrichie des bilans et, avec un repère, des parts dans
 * la méta du jeu.
 */
export function computeGroupMeta(
  input: GroupMetaResult[],
  cards: Record<string, MetaCard>,
  deckCards: Map<string, MetaSampleDeck["cards"]> = new Map(),
  reference?: MetaReference,
): GroupMeta {
  const results = harmonizeLegends(input);
  const decks = results.map((result) => toSampleDeck(result, result.deckId ? deckCards.get(result.deckId) : undefined));
  const overview = computeOverview(decks, cards, []);

  const total = emptyRecord();
  for (const result of results) addRecord(total, result.record);

  const byLegend = new Map<string, { record: MatchRecord; users: Map<string, number> }>();
  for (const result of results) {
    const key = legendKey(result);
    if (!key) continue;
    const entry = byLegend.get(key) ?? { record: emptyRecord(), users: new Map<string, number>() };
    addRecord(entry.record, result.record);
    entry.users.set(result.userId, (entry.users.get(result.userId) ?? 0) + 1);
    byLegend.set(key, entry);
  }

  const legends: GroupLegendRow[] = overview.legends.map((legend) => {
    const entry = byLegend.get(legend.key);
    const record = entry?.record ?? emptyRecord();
    return {
      ...legend,
      ...record,
      matches: recordMatches(record),
      ...(groupRate(record) !== undefined ? { rate: groupRate(record) } : {}),
      userIds: [...(entry?.users ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([userId]) => userId),
      ...(reference ? { metaShare: reference.legendShare({ cardId: legend.cardId, name: legend.name }) } : {}),
    };
  });

  const domains: GroupDomainRow[] = overview.domains.map((domain) => ({
    ...domain,
    ...(reference ? { metaShare: reference.domainShare(domain.domain) } : {}),
  }));

  const byUser = new Map<string, GroupMetaResult[]>();
  for (const result of results) {
    const list = byUser.get(result.userId) ?? [];
    list.push(result);
    byUser.set(result.userId, list);
  }
  const members: GroupMemberRow[] = [...byUser]
    .map(([userId, own]) => {
      const record = emptyRecord();
      for (const result of own) addRecord(record, result.record);
      const placements = own.map((result) => result.placement).filter((value): value is number => value !== undefined);
      const legendCounts = new Map<string, number>();
      for (const result of own) {
        const key = legendKey(result);
        if (key) legendCounts.set(key, (legendCounts.get(key) ?? 0) + 1);
      }
      const last = [...own].sort((a, b) => b.date.localeCompare(a.date))[0];
      return {
        userId,
        ...record,
        tournaments: new Set(own.map(tournamentKey)).size,
        topEights: placements.filter((placement) => placement <= 8).length,
        ...(placements.length > 0 ? { best: Math.min(...placements) } : {}),
        matches: recordMatches(record),
        ...(groupRate(record) !== undefined ? { rate: groupRate(record) } : {}),
        legends: [...legendCounts].sort((a, b) => b[1] - a[1]).map(([key]) => key),
        last: { name: last.name, date: last.date, ...(last.placement !== undefined ? { placement: last.placement } : {}) },
      };
    })
    .sort((a, b) => b.tournaments - a.tournaments || (b.rate ?? -1) - (a.rate ?? -1) || a.userId.localeCompare(b.userId));

  return {
    totals: {
      ...total,
      participations: results.length,
      tournaments: new Set(results.map(tournamentKey)).size,
      members: byUser.size,
      topEights: results.filter((result) => result.placement !== undefined && result.placement <= 8).length,
      matches: recordMatches(total),
      ...(groupRate(total) !== undefined ? { rate: groupRate(total) } : {}),
      ...(results.length > 0 ? { latest: results.reduce((max, result) => (result.date > max ? result.date : max), "") } : {}),
    },
    overview,
    legends,
    domains,
    members,
  };
}

// ---------------------------------------------------------------------------
// Confrontations : les matchs connus, vus du côté des membres
// ---------------------------------------------------------------------------

/** Un match d'un membre : sa légende, celle d'en face, le résultat. */
export type GroupMatchSide = {
  userId: string;
  legend?: string;
  legendCardId?: string;
  opponentLegend?: string;
  opponentLegendCardId?: string;
  /** L'adversaire est aussi membre : le match se joue « en famille » et ne dit rien de la méta. */
  opponentIsMember: boolean;
  result: "W" | "L" | "D";
};

/**
 * Donne leur carte aux légendes des matchs lues par leur seul nom (le
 * locator ne donne souvent que le nom), d'après les légendes connues : celles
 * des résultats, des autres matchs, de la méta du jeu.
 */
export function harmonizeSides<T extends GroupMatchSide>(sides: T[], known: { cardId: string; name: string }[]): T[] {
  const cardByShort = new Map<string, string>();
  for (const legend of known) if (!cardByShort.has(legendShortKey(legend.name))) cardByShort.set(legendShortKey(legend.name), legend.cardId);
  for (const side of sides) {
    if (side.legend && side.legendCardId) cardByShort.set(legendShortKey(side.legend), side.legendCardId);
    if (side.opponentLegend && side.opponentLegendCardId) cardByShort.set(legendShortKey(side.opponentLegend), side.opponentLegendCardId);
  }
  return sides.map((side) => {
    const legendCardId = side.legendCardId ?? (side.legend ? cardByShort.get(legendShortKey(side.legend)) : undefined);
    const opponentLegendCardId =
      side.opponentLegendCardId ?? (side.opponentLegend ? cardByShort.get(legendShortKey(side.opponentLegend)) : undefined);
    return {
      ...side,
      ...(legendCardId ? { legendCardId } : {}),
      ...(opponentLegendCardId ? { opponentLegendCardId } : {}),
    };
  });
}

/**
 * Les matchs d'un tournoi du locator joués par des membres. `members` donne
 * le membre de chaque inscription reconnue (« C'est moi »).
 */
export function locatorSides(event: MetaEventMatches, members: Map<number, string>): GroupMatchSide[] {
  const players = new Map(event.players.map((player) => [player.id, player]));
  const sides: GroupMatchSide[] = [];
  for (const match of event.matches) {
    if (match.b === undefined) continue;
    const pairs: ["a" | "b", number, number][] = [
      ["a", match.a, match.b],
      ["b", match.b, match.a],
    ];
    for (const [side, mine, theirs] of pairs) {
      const userId = members.get(mine);
      if (!userId) continue;
      const player = players.get(mine);
      const opponent = players.get(theirs);
      sides.push({
        userId,
        ...(player?.legend ? { legend: player.legend } : {}),
        ...(player?.legendCardId ? { legendCardId: player.legendCardId } : {}),
        ...(opponent?.legend ? { opponentLegend: opponent.legend } : {}),
        ...(opponent?.legendCardId ? { opponentLegendCardId: opponent.legendCardId } : {}),
        opponentIsMember: members.has(theirs),
        result: match.winner === null ? "D" : match.winner === side ? "W" : "L",
      });
    }
  }
  return sides;
}

export type JoutesMatch = {
  players: { playerId: string }[];
  winnerIds: string[];
  status: string;
  resolution?: string;
};

type KnownLegend = { name: string; cardId?: string };

/**
 * Les matchs d'un tournoi Joutes joués par des membres. `userOf` donne le
 * compte de chaque joueur inscrit, `legendOf` la légende d'un joueur quand
 * son résultat la dit (et qu'on a le droit de la lire).
 */
export function joutesSides(
  matches: JoutesMatch[],
  userOf: Map<string, string>,
  legendOf: Map<string, KnownLegend>,
  memberIds: Set<string>,
): GroupMatchSide[] {
  const sides: GroupMatchSide[] = [];
  for (const match of matches) {
    if (match.status !== "completed" || match.players.length !== 2) continue;
    // Un forfait ou une double défaite : aucune partie jouée, rien sur le matchup.
    if (match.resolution && match.resolution !== "played") continue;
    const [first, second] = match.players.map((player) => player.playerId);
    for (const [mine, theirs] of [
      [first, second],
      [second, first],
    ]) {
      const userId = userOf.get(mine);
      if (!userId || !memberIds.has(userId)) continue;
      const theirUser = userOf.get(theirs);
      const legend = legendOf.get(mine);
      const opponent = legendOf.get(theirs);
      const result = match.winnerIds.length === 0 ? "D" : match.winnerIds.includes(mine) ? "W" : "L";
      sides.push({
        userId,
        ...(legend ? { legend: legend.name, ...(legend.cardId ? { legendCardId: legend.cardId } : {}) } : {}),
        ...(opponent
          ? { opponentLegend: opponent.name, ...(opponent.cardId ? { opponentLegendCardId: opponent.cardId } : {}) }
          : {}),
        opponentIsMember: Boolean(theirUser && memberIds.has(theirUser)),
        result,
      });
    }
  }
  return sides;
}

export type OpponentRow = MatchRecord & {
  legend: string;
  cardId?: string;
  matches: number;
  rate?: number;
};

export type PairingRow = MatchRecord & {
  legend: string;
  legendCardId?: string;
  opponent: string;
  opponentCardId?: string;
  matches: number;
  rate?: number;
};

export type GroupMatchups = {
  /** Les matchs comptés : contre des non-membres, légende adverse connue, hors miroirs. */
  counted: number;
  /** Tous les matchs connus des membres. */
  known: number;
  opponents: OpponentRow[];
  pairings: PairingRow[];
};

function sameLegend(a?: string, b?: string): boolean {
  return Boolean(a && b && legendShortKey(a) === legendShortKey(b));
}

function add(record: MatchRecord, result: GroupMatchSide["result"]) {
  if (result === "W") record.wins += 1;
  else if (result === "L") record.losses += 1;
  else record.draws += 1;
}

function rows<T extends MatchRecord>(entries: Iterable<T>): (T & { matches: number; rate?: number })[] {
  return [...entries]
    .map((entry) => ({ ...entry, matches: recordMatches(entry), ...(groupRate(entry) !== undefined ? { rate: groupRate(entry) } : {}) }))
    .sort((a, b) => b.matches - a.matches || (b.rate ?? -1) - (a.rate ?? -1));
}

/**
 * Le bilan du groupe contre chaque légende adverse, et par paire « ma
 * légende contre la leur ». Un match entre membres ne compte pas, un miroir
 * non plus (comme dans la méta du jeu).
 */
export function groupMatchups(sides: GroupMatchSide[], userId?: string): GroupMatchups {
  const mine = userId ? sides.filter((side) => side.userId === userId) : sides;
  const counted = mine.filter(
    (side) => !side.opponentIsMember && side.opponentLegend && !sameLegend(side.legend, side.opponentLegend),
  );

  const opponents = new Map<string, OpponentRow>();
  const pairings = new Map<string, PairingRow>();
  for (const side of counted) {
    const theirs = side.opponentLegend as string;
    // Par nom court : le locator ne donne pas la carte, Joutes si.
    const opponentKey = legendShortKey(theirs);
    const opponent = opponents.get(opponentKey) ?? { legend: theirs, ...emptyRecord(), matches: 0 };
    if (side.opponentLegendCardId) opponent.cardId ??= side.opponentLegendCardId;
    if (theirs.length > opponent.legend.length) opponent.legend = theirs;
    add(opponent, side.result);
    opponents.set(opponentKey, opponent);

    if (side.legend) {
      const pairKey = `${legendShortKey(side.legend)}|${opponentKey}`;
      const pairing = pairings.get(pairKey) ?? { legend: side.legend, opponent: theirs, ...emptyRecord(), matches: 0 };
      if (side.legendCardId) pairing.legendCardId ??= side.legendCardId;
      if (side.opponentLegendCardId) pairing.opponentCardId ??= side.opponentLegendCardId;
      if (side.legend.length > pairing.legend.length) pairing.legend = side.legend;
      if (theirs.length > pairing.opponent.length) pairing.opponent = theirs;
      add(pairing, side.result);
      pairings.set(pairKey, pairing);
    }
  }

  // Un match entre deux membres donne un côté à chacun : il ne compte qu'une
  // fois parmi les matchs connus du groupe.
  const family = mine.filter((side) => side.opponentIsMember).length;
  const known = userId ? mine.length : mine.length - family + Math.ceil(family / 2);

  return { counted: counted.length, known, opponents: rows(opponents.values()), pairings: rows(pairings.values()) };
}
