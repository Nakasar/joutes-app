/**
 * Winrates, matchups et parcours des joueurs, en fonctions pures, à partir
 * des matchs importés d'un tournoi (aujourd'hui : le locator Riftbound).
 *
 * Règles de calcul :
 * - un nul compte pour une demi-victoire ;
 * - un bye ne compte pas ;
 * - un miroir (même légende des deux côtés) ne compte pas pour sa légende ;
 * - un match dont un joueur n'a pas de légende connue ne compte pas pour les
 *   winrates par légende, mais reste dans le parcours des joueurs.
 */

export type MetaEventPlayer = {
  /** L'inscription au locator. */
  id: number;
  name: string;
  place?: number;
  /** Victoires-défaites-nuls : `5-1-0`. */
  record: string;
  /** Le nom de la légende jouée, tel que le locator l'écrit. */
  legend?: string;
  legendCardId?: string;
  legendImage?: string;
  domains: string[];
};

export type MetaEventMatch = {
  round: number;
  phase: "swiss" | "top";
  a: number;
  /** Absent pour un bye. */
  b?: number;
  /** `null` pour un nul. */
  winner: "a" | "b" | null;
  /** Manches gagnées par `a`, puis par `b`. */
  games: [number, number];
};

export type MetaEventMatches = {
  id: string;
  source: string;
  /** Date ISO du tournoi. */
  eventDate: string;
  url?: string;
  players: MetaEventPlayer[];
  matches: MetaEventMatch[];
};

export type MatchRecord = { wins: number; losses: number; draws: number };

/** Sous ce nombre de matchs, un winrate s'affiche grisé. */
export const MIN_MATCHES_FOR_RATE = 20;

export function emptyRecord(): MatchRecord {
  return { wins: 0, losses: 0, draws: 0 };
}

export function recordMatches(record: MatchRecord): number {
  return record.wins + record.losses + record.draws;
}

/** Victoires plus demi-nuls, sur les matchs joués ; rien sans match. */
export function winrate(record: MatchRecord): number | undefined {
  const total = recordMatches(record);
  return total > 0 ? (record.wins + record.draws / 2) / total : undefined;
}

export type MatchFilter = {
  /** Compter aussi les matchs du top (élimination directe). Non par défaut : il ne joue que les meilleurs. */
  includeTop?: boolean;
};

type Side = { player: MetaEventPlayer; opponent: MetaEventPlayer; result: "W" | "L" | "D" };

/** Chaque match joué (hors bye), vu des deux côtés. */
function* playedSides(events: MetaEventMatches[], filter: MatchFilter = {}): Generator<Side & { event: MetaEventMatches }> {
  for (const event of events) {
    const players = new Map(event.players.map((player) => [player.id, player]));
    for (const match of event.matches) {
      if (match.b === undefined) continue;
      if (match.phase === "top" && !filter.includeTop) continue;
      const a = players.get(match.a);
      const b = players.get(match.b);
      if (!a || !b) continue;
      const resultA = match.winner === null ? "D" : match.winner === "a" ? "W" : "L";
      const resultB = resultA === "D" ? "D" : resultA === "W" ? "L" : "W";
      yield { event, player: a, opponent: b, result: resultA };
      yield { event, player: b, opponent: a, result: resultB };
    }
  }
}

function add(record: MatchRecord, result: "W" | "L" | "D") {
  if (result === "W") record.wins += 1;
  else if (result === "L") record.losses += 1;
  else record.draws += 1;
}

export type LegendWinrate = MatchRecord & {
  legend: string;
  legendCardId?: string;
  legendImage?: string;
  domains: string[];
  /** Joueurs qui l'ont jouée (un par tournoi). */
  players: number;
  /** Tournois où elle a été jouée. */
  events: number;
  /** Joueurs classés dans le top 8 avec elle. */
  top8: number;
  matches: number;
  rate?: number;
};

/** Les légendes connues, avec leur bilan hors miroirs. Celles qui ont assez de matchs d'abord, par winrate. */
export function legendWinrates(events: MetaEventMatches[], filter: MatchFilter = {}): LegendWinrate[] {
  const rows = new Map<string, LegendWinrate>();
  const row = (player: MetaEventPlayer) => {
    const key = player.legend as string;
    let found = rows.get(key);
    if (!found) {
      found = {
        legend: key,
        ...(player.legendCardId ? { legendCardId: player.legendCardId } : {}),
        ...(player.legendImage ? { legendImage: player.legendImage } : {}),
        domains: player.domains,
        players: 0,
        events: 0,
        top8: 0,
        matches: 0,
        ...emptyRecord(),
      };
      rows.set(key, found);
    }
    return found;
  };

  for (const event of events) {
    const legendsHere = new Set<string>();
    for (const player of event.players) {
      if (!player.legend) continue;
      const found = row(player);
      found.players += 1;
      if (player.place !== undefined && player.place <= 8) found.top8 += 1;
      legendsHere.add(player.legend);
    }
    for (const legend of legendsHere) (rows.get(legend) as LegendWinrate).events += 1;
  }

  for (const side of playedSides(events, filter)) {
    if (!side.player.legend || !side.opponent.legend || side.player.legend === side.opponent.legend) continue;
    add(row(side.player), side.result);
  }

  return sortByRate([...rows.values()].map((found) => ({ ...found, matches: recordMatches(found), rate: winrate(found) })));
}

function sortByRate<T extends { matches: number; rate?: number }>(rows: T[]): T[] {
  return rows.sort((a, b) => {
    const enoughA = a.matches >= MIN_MATCHES_FOR_RATE;
    const enoughB = b.matches >= MIN_MATCHES_FOR_RATE;
    if (enoughA !== enoughB) return enoughA ? -1 : 1;
    return (b.rate ?? -1) - (a.rate ?? -1) || b.matches - a.matches;
  });
}

export type DomainWinrate = MatchRecord & { domain: string; matches: number; rate?: number };

/**
 * Le bilan de chaque domaine : un deck compte pour chacun de ses domaines,
 * sauf contre un deck qui le joue aussi.
 */
export function domainWinrates(events: MetaEventMatches[], filter: MatchFilter = {}): DomainWinrate[] {
  const rows = new Map<string, MatchRecord>();
  for (const side of playedSides(events, filter)) {
    for (const domain of side.player.domains) {
      if (side.opponent.domains.includes(domain)) continue;
      const found = rows.get(domain) ?? emptyRecord();
      add(found, side.result);
      rows.set(domain, found);
    }
  }
  return sortByRate([...rows].map(([domain, record]) => ({ domain, ...record, matches: recordMatches(record), rate: winrate(record) })));
}

/** Le bilan de chaque légende contre chaque autre, vu de la première : `matchups.get(a)?.get(b)`. */
export function legendMatchups(events: MetaEventMatches[], filter: MatchFilter = {}): Map<string, Map<string, MatchRecord>> {
  const table = new Map<string, Map<string, MatchRecord>>();
  for (const side of playedSides(events, filter)) {
    const mine = side.player.legend;
    const theirs = side.opponent.legend;
    if (!mine || !theirs || mine === theirs) continue;
    const line = table.get(mine) ?? new Map<string, MatchRecord>();
    const record = line.get(theirs) ?? emptyRecord();
    add(record, side.result);
    line.set(theirs, record);
    table.set(mine, line);
  }
  return table;
}

export type PlayerRound = {
  round: number;
  phase: "swiss" | "top";
  /** Absent pour un bye. */
  opponent?: MetaEventPlayer;
  result: "W" | "L" | "D" | "BYE";
  /** Manches du joueur, puis de l'adversaire. */
  games: [number, number];
};

/** Les rondes d'un joueur, dans l'ordre. */
export function playerRounds(event: MetaEventMatches, playerId: number): PlayerRound[] {
  const players = new Map(event.players.map((player) => [player.id, player]));
  const rounds: PlayerRound[] = [];
  for (const match of event.matches) {
    if (match.a !== playerId && match.b !== playerId) continue;
    if (match.b === undefined) {
      rounds.push({ round: match.round, phase: match.phase, result: "BYE", games: [0, 0] });
      continue;
    }
    const isA = match.a === playerId;
    const opponent = players.get(isA ? match.b : match.a);
    const result = match.winner === null ? "D" : (match.winner === "a") === isA ? "W" : "L";
    rounds.push({
      round: match.round,
      phase: match.phase,
      ...(opponent ? { opponent } : {}),
      result,
      games: isA ? match.games : [match.games[1], match.games[0]],
    });
  }
  return rounds.sort((a, b) => a.round - b.round);
}

export type FacedLegend = MatchRecord & { legend: string; legendImage?: string; domains: string[]; matches: number };

/** Les légendes affrontées par ces joueurs, sur tout le tournoi, avec leur bilan contre chacune. Les plus rencontrées d'abord. */
export function facedLegends(event: MetaEventMatches, playerIds: number[]): FacedLegend[] {
  const rows = new Map<string, FacedLegend>();
  for (const id of playerIds) {
    for (const round of playerRounds(event, id)) {
      if (round.result === "BYE" || !round.opponent?.legend) continue;
      const opponent = round.opponent;
      const found =
        rows.get(opponent.legend as string) ??
        ({
          legend: opponent.legend as string,
          ...(opponent.legendImage ? { legendImage: opponent.legendImage } : {}),
          domains: opponent.domains,
          matches: 0,
          ...emptyRecord(),
        } satisfies FacedLegend);
      add(found, round.result);
      found.matches = recordMatches(found);
      rows.set(found.legend, found);
    }
  }
  return [...rows.values()].sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.legend.localeCompare(b.legend, "fr"));
}

/** Les joueurs classés jusqu'à `size`, du premier au dernier. */
export function topCutPlayers(event: MetaEventMatches, size = 8): MetaEventPlayer[] {
  return event.players
    .filter((player) => player.place !== undefined && player.place <= size)
    .sort((a, b) => (a.place as number) - (b.place as number));
}

export type MatchTotals = { matches: number; draws: number; byes: number; rounds: number };

/** De quoi présenter les matchs d'un ou plusieurs tournois. */
export function matchTotals(events: MetaEventMatches[]): MatchTotals {
  let matches = 0;
  let draws = 0;
  let byes = 0;
  let rounds = 0;
  for (const event of events) {
    rounds = Math.max(rounds, ...event.matches.map((match) => match.round));
    for (const match of event.matches) {
      if (match.b === undefined) byes += 1;
      else {
        matches += 1;
        if (match.winner === null) draws += 1;
      }
    }
  }
  return { matches, draws, byes, rounds };
}

/** Le nom court d'une légende : « Kennen, Heart of the Tempest » donne « Kennen ». */
export function shortLegendName(legend: string): string {
  return legend.split(",")[0].trim() || legend;
}

export type LopsidedMatchup = { legend: string; opponent: string; matches: number; rate: number };

/** Le matchup le plus loin de 50 %, parmi ceux qui ont assez de matchs, vu de la légende qui le gagne. */
export function mostLopsidedMatchup(matchups: Map<string, Map<string, MatchRecord>>): LopsidedMatchup | undefined {
  let best: LopsidedMatchup | undefined;
  for (const [legend, line] of matchups) {
    for (const [opponent, record] of line) {
      const matches = recordMatches(record);
      const rate = winrate(record);
      if (matches < MIN_MATCHES_FOR_RATE || rate === undefined || rate <= 0.5) continue;
      if (!best || rate > best.rate || (rate === best.rate && matches > best.matches)) best = { legend, opponent, matches, rate };
    }
  }
  return best;
}

/** Les matchs d'un tournoi dans la période : `from` et `to` compris, en jours `AAAA-MM-JJ`. */
export function eventsBetween(events: MetaEventMatches[], from?: string, to?: string): MetaEventMatches[] {
  return events.filter((event) => {
    const day = event.eventDate.slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  });
}
