/**
 * Simuler un deck : des parties entre IA, jouées dans le navigateur, pour
 * mesurer combien en gagne un deck. Fonctions pures, partagées par le
 * navigateur (tirage, statistiques) et le serveur (vérification).
 *
 * Une partie simulée se rejoue à l'identique : même configuration, même graine,
 * mêmes niveaux (voir `simulate` dans joutes-engine). On ne garde donc que son
 * résumé et sa graine.
 */

import type { SwuConfig, SwuDeckList } from "@/lib/engine/swu/types";
import type { BotLevel, EngineConfig, EngineDeckList } from "@/lib/engine/types";

/** La liste d'un deck simulé, dans le format du moteur de son jeu. */
export type SimulationList = EngineDeckList | SwuDeckList;

/** D'où vient un deck adverse possible. */
export type SimulationSource = "meta" | "mine" | "shared" | "public" | "auto";

export const SIMULATION_SOURCES: SimulationSource[] = ["meta", "mine", "shared", "public", "auto"];

/** Un deck que la série peut jouer, figé à la création : la revoir rejoue ce deck-là. */
export type SimulationDeck = {
  /** `deck:<id>` pour un deck Joutes, `auto:<légende>` pour un deck automatique. */
  key: string;
  name: string;
  source: SimulationSource | "fixed";
  /** Code moteur de la légende, ou du leader à Star Wars: Unlimited. */
  legend: string;
  domains?: string[];
  deckId?: string;
  list: SimulationList;
};

/** Le résumé d'une partie, tel que le moteur le rend (`GameSummary`). */
export type EngineGameSummary = {
  seed: number;
  first_seat: number;
  winners: number[];
  reason: string;
  /** Faux aussi quand le moteur a dû interrompre la partie (`interrupted`). */
  finished: boolean;
  interrupted?: boolean;
  turns: number;
  decisions: number;
  points: number[];
};

/** Une partie de la série, du point de vue du deck évalué. */
export type SimulationGame = {
  /** Rang dans la série, à partir de 0. */
  n: number;
  seed: number;
  /** Clé du deck adverse dans `opponents`. */
  opp: string;
  /** Le siège du deck évalué (0 ou 1). */
  seat: number;
  /** Le deck évalué a pris le premier tour. */
  first: boolean;
  /** `null` : nulle, ou partie arrêtée sans conclusion. */
  win: boolean | null;
  finished: boolean;
  turns: number;
  decisions: number;
  /** Points du deck évalué, puis de l'adversaire. */
  score: [number, number];
};

export const SIMULATION_SIZES = [20, 50, 100, 200, 400] as const;
/** Une série ne dépasse pas ce nombre de parties, ajouts compris. */
export const MAX_SIMULATION_GAMES = 1000;
/** Taille maximale d'un ensemble de decks adverses figé dans une série. */
export const MAX_POOL_DECKS = 300;

/**
 * Qui joue où et qui commence, partie par partie : le deck évalué change de
 * siège toutes les deux parties et le premier joueur alterne à chaque partie,
 * pour que ni le siège ni l'initiative ne pèsent sur le résultat.
 */
export function gameSeating(n: number): { seat: number; firstPlayer: number } {
  return { seat: Math.floor(n / 2) % 2, firstPlayer: n % 2 };
}

/**
 * La configuration de la partie `n` : le deck évalué à son siège, l'adversaire
 * à l'autre. Les noms n'y changent rien pour le moteur ; la table les montre.
 */
export function gameConfig(n: number, mine: SimulationDeck, opponent: SimulationDeck, names: [string, string]): EngineConfig {
  const { seat, firstPlayer } = gameSeating(n);
  const me = { name: names[0].slice(0, 40), deck: mine.list as EngineDeckList };
  const them = { name: names[1].slice(0, 40), deck: opponent.list as EngineDeckList };
  return { mode: "duel", players: seat === 0 ? [me, them] : [them, me], first_player: firstPlayer };
}

/**
 * La même chose pour Star Wars: Unlimited. Le deck évalué change aussi de
 * siège toutes les deux parties ; l'initiative, elle, est tirée par le moteur
 * avec la graine de la partie (un joueur au hasard la choisit).
 */
export function swuGameConfig(n: number, mine: SimulationDeck, opponent: SimulationDeck, names: [string, string]): SwuConfig {
  const { seat } = gameSeating(n);
  // Un leader porte son titre : le nom d'un deck automatique dépasse vite la place d'un siège.
  const short = (name: string) => (name.length > 40 ? `${name.slice(0, 39)}…` : name);
  const me = { name: short(names[0]), deck: mine.list as SwuDeckList };
  const them = { name: short(names[1]), deck: opponent.list as SwuDeckList };
  return { players: seat === 0 ? [me, them] : [them, me] };
}

/** Le résumé du moteur, ramené au deck évalué. */
export function toSimulationGame(n: number, opp: string, summary: EngineGameSummary): SimulationGame {
  const { seat } = gameSeating(n);
  const other = 1 - seat;
  return {
    n,
    seed: summary.seed,
    opp,
    seat,
    first: summary.first_seat === seat,
    win: summary.finished && summary.winners.length === 1 ? summary.winners[0] === seat : null,
    finished: summary.finished,
    turns: summary.turns,
    decisions: summary.decisions,
    score: [summary.points[seat] ?? 0, summary.points[other] ?? 0],
  };
}

/**
 * Tire le deck adverse d'une partie. Sans `byLegend`, chaque deck a la même
 * chance : une légende jouée par deux fois plus de decks méta sort deux fois
 * plus souvent. Avec `byLegend`, chaque légende a la même chance, puis un de
 * ses decks.
 */
export function drawOpponent(pool: SimulationDeck[], byLegend: boolean, random: () => number): SimulationDeck {
  if (pool.length === 0) throw new Error("ensemble vide");
  const pick = <T>(list: T[]): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  if (!byLegend) return pick(pool);
  const legends = [...new Set(pool.map((deck) => deck.legend))].sort();
  const legend = pick(legends);
  return pick(pool.filter((deck) => deck.legend === legend));
}

/**
 * Intervalle de confiance à 95 % d'une proportion (Wilson) : plus juste que
 * « p ± 1,96 σ » quand il y a peu de parties ou un résultat proche de 0 ou 100 %.
 */
export function wilson(wins: number, games: number): { low: number; high: number } {
  if (games === 0) return { low: 0, high: 1 };
  const z = 1.96;
  const p = wins / games;
  const denominator = 1 + (z * z) / games;
  const centre = (p + (z * z) / (2 * games)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))) / denominator;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** La demi-largeur de la fourchette attendue pour N parties, au pire (50 %), en points. */
export function expectedMargin(games: number): number {
  return Math.round(196 * Math.sqrt(0.25 / Math.max(1, games)));
}

export type Tally = { games: number; wins: number; losses: number; rate: number | null };

function tally(games: SimulationGame[]): Tally {
  const wins = games.filter((game) => game.win === true).length;
  const losses = games.filter((game) => game.win === false).length;
  const decided = wins + losses;
  return { games: games.length, wins, losses, rate: decided ? wins / decided : null };
}

/** `deckKey` : le deck, quand la légende n'a été jouée qu'avec un seul. */
export type OpponentStats = Tally & { legend: string; deckKey?: string; decks: number };

export type SimulationStats = Tally & {
  /** Parties nulles ou arrêtées sans conclusion. */
  undecided: number;
  low: number;
  high: number;
  first: Tally;
  second: Tally;
  turns: number | null;
  winTurns: number | null;
  score: [number, number] | null;
  /** Par légende adverse, les plus jouées d'abord. */
  opponents: OpponentStats[];
};

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export function simulationStats(games: SimulationGame[], opponents: Record<string, SimulationDeck>): SimulationStats {
  const all = tally(games);
  const decided = all.wins + all.losses;
  const { low, high } = wilson(all.wins, decided);
  const byLegend = new Map<string, SimulationGame[]>();
  for (const game of games) {
    const legend = opponents[game.opp]?.legend ?? "?";
    byLegend.set(legend, [...(byLegend.get(legend) ?? []), game]);
  }
  const rows: OpponentStats[] = [...byLegend.entries()].map(([legend, list]) => {
    const keys = new Set(list.map((game) => game.opp));
    return { ...tally(list), legend, ...(keys.size === 1 ? { deckKey: list[0].opp } : {}), decks: keys.size };
  });
  rows.sort((a, b) => b.games - a.games || a.legend.localeCompare(b.legend));
  const finished = games.filter((game) => game.finished);
  return {
    ...all,
    undecided: games.length - decided,
    low,
    high,
    first: tally(games.filter((game) => game.first)),
    second: tally(games.filter((game) => !game.first)),
    turns: mean(finished.map((game) => game.turns)),
    winTurns: mean(games.filter((game) => game.win === true).map((game) => game.turns)),
    score: finished.length
      ? [mean(finished.map((game) => game.score[0])) ?? 0, mean(finished.map((game) => game.score[1])) ?? 0]
      : null,
    opponents: rows,
  };
}

/** Durée attendue d'une partie dans le navigateur, en secondes (mesurée sur le moteur). */
export const SECONDS_PER_GAME: Record<BotLevel, number> = { easy: 0.05, normal: 0.45, hard: 0.8 };

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Une partie envoyée par le navigateur, vérifiée avant d'être enregistrée :
 * la bonne forme, et un adversaire qui existe dans la série. `null` sinon.
 */
export function parseSimulationGame(value: unknown, opponents: Record<string, unknown>): SimulationGame | null {
  const game = value as Partial<SimulationGame> | null;
  if (!game || typeof game !== "object") return null;
  if (!isInt(game.n, 0, MAX_SIMULATION_GAMES - 1) || !isInt(game.seed, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (typeof game.opp !== "string" || !Object.hasOwn(opponents, game.opp)) return null;
  if (!isInt(game.seat, 0, 1) || typeof game.first !== "boolean" || typeof game.finished !== "boolean") return null;
  if (game.win !== null && typeof game.win !== "boolean") return null;
  if (!isInt(game.turns, 0, 10_000) || !isInt(game.decisions, 0, 1_000_000)) return null;
  const score = game.score;
  if (!Array.isArray(score) || score.length !== 2 || !score.every((point) => isInt(point, 0, 100))) return null;
  return {
    n: game.n,
    seed: game.seed,
    opp: game.opp,
    seat: game.seat,
    first: game.first,
    win: game.win,
    finished: game.finished,
    turns: game.turns,
    decisions: game.decisions,
    score: [score[0], score[1]],
  };
}
