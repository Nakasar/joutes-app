import assert from "node:assert/strict";
import { test } from "node:test";

import {
  drawOpponent,
  gameConfig,
  gameSeating,
  swuGameConfig,
  parseSimulationGame,
  simulationStats,
  toSimulationGame,
  wilson,
  type SimulationDeck,
  type SimulationGame,
} from "./simulation.ts";

const deck = (key: string, legend: string): SimulationDeck => ({ key, name: key, source: "meta", legend, list: { cards: [] } as never });

const game = (n: number, opp: string, win: boolean | null, first = n % 2 === 0): SimulationGame => ({
  n,
  seed: n + 1,
  opp,
  seat: gameSeating(n).seat,
  first,
  win,
  finished: win !== null,
  turns: 10,
  decisions: 100,
  score: win ? [8, 5] : [5, 8],
});

test("le siège change toutes les deux parties, le premier joueur à chaque partie", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(gameSeating), [
    { seat: 0, firstPlayer: 0 },
    { seat: 0, firstPlayer: 1 },
    { seat: 1, firstPlayer: 0 },
    { seat: 1, firstPlayer: 1 },
    { seat: 0, firstPlayer: 0 },
  ]);
});

test("gameConfig place le deck évalué à son siège", () => {
  const mine = deck("deck:a", "Jinx");
  const them = deck("deck:b", "Viktor");
  const config = gameConfig(2, mine, them, ["Moi", "Eux"]) as { players: { name: string }[]; first_player: number };
  assert.deepEqual(
    config.players.map((player) => player.name),
    ["Eux", "Moi"],
  );
  assert.equal(config.first_player, 0);
});

test("toSimulationGame ramène le résumé au deck évalué", () => {
  const summary = { seed: 7, first_seat: 1, winners: [1], reason: "score", finished: true, turns: 12, decisions: 300, points: [4, 8] };
  // Partie 2 : le deck évalué est au siège 1.
  const result = toSimulationGame(2, "deck:b", summary);
  assert.equal(result.seat, 1);
  assert.equal(result.win, true);
  assert.equal(result.first, true);
  assert.deepEqual(result.score, [8, 4]);
  // Partie 0 : siège 0, il a perdu.
  assert.equal(toSimulationGame(0, "deck:b", summary).win, false);
  // Pas fini : ni victoire ni défaite.
  assert.equal(toSimulationGame(0, "deck:b", { ...summary, finished: false, winners: [] }).win, null);
});

test("drawOpponent par légende donne la même chance à chaque légende", () => {
  const pool = [deck("a1", "A"), deck("a2", "A"), deck("a3", "A"), deck("b1", "B")];
  assert.equal(drawOpponent(pool, true, () => 0.99).legend, "B");
  assert.equal(drawOpponent(pool, true, () => 0.4).legend, "A");
  // Sans légende : chaque deck a la même chance, A sort 3 fois sur 4.
  assert.equal(drawOpponent(pool, false, () => 0.7).key, "a3");
  assert.throws(() => drawOpponent([], false, Math.random));
});

test("wilson encadre la proportion", () => {
  const { low, high } = wilson(30, 50);
  assert.ok(low < 0.6 && high > 0.6);
  assert.ok(Math.abs(low - 0.4618) < 0.001, String(low));
  assert.ok(Math.abs(high - 0.7239) < 0.001, String(high));
  assert.deepEqual(wilson(0, 0), { low: 0, high: 1 });
  assert.ok(wilson(0, 10).low === 0 && wilson(10, 10).high === 1);
});

test("simulationStats compte par légende et par initiative", () => {
  const opponents = { a1: deck("a1", "A"), a2: deck("a2", "A"), b1: deck("b1", "B") };
  const games = [game(0, "a1", true), game(1, "a2", false), game(2, "a1", true), game(3, "b1", null)];
  const stats = simulationStats(games, opponents);
  assert.equal(stats.wins, 2);
  assert.equal(stats.losses, 1);
  assert.equal(stats.undecided, 1);
  assert.equal(stats.rate, 2 / 3);
  assert.deepEqual(
    stats.opponents.map((row) => [row.legend, row.games, row.decks, row.deckKey]),
    [
      ["A", 3, 2, undefined],
      ["B", 1, 1, "b1"],
    ],
  );
  assert.equal(stats.first.games, 2);
  assert.equal(stats.first.wins, 2);
  assert.equal(stats.second.losses, 1);
  assert.equal(stats.turns, 10);
});

test("parseSimulationGame refuse une partie mal formée ou un adversaire inconnu", () => {
  const opponents = { a1: {} };
  const valid = game(4, "a1", true);
  assert.deepEqual(parseSimulationGame(valid, opponents), valid);
  assert.equal(parseSimulationGame({ ...valid, opp: "zz" }, opponents), null);
  assert.equal(parseSimulationGame({ ...valid, opp: "__proto__" }, opponents), null);
  assert.equal(parseSimulationGame({ ...valid, n: 5000 }, opponents), null);
  assert.equal(parseSimulationGame({ ...valid, score: [1] }, opponents), null);
  assert.equal(parseSimulationGame({ ...valid, win: "oui" }, opponents), null);
  assert.equal(parseSimulationGame(null, opponents), null);
});

test("à Star Wars: Unlimited, le deck évalué change de siège et un long nom de siège est abrégé", () => {
  const mine = deck("deck:a", "SOR-005");
  const theirs = deck("auto:SOR-010", "SOR-010");
  const long = "Cad Bane, Toujours Plus Rapide Que Toi (deck automatique)";
  const first = swuGameConfig(0, mine, theirs, ["Mon deck", long]);
  assert.deepEqual(
    first.players.map((player) => player.name),
    ["Mon deck", `${long.slice(0, 39)}…`],
  );
  assert.equal(first.players[1].name.length, 40);
  assert.equal(swuGameConfig(2, mine, theirs, ["Mon deck", "Autre"]).players[1].name, "Mon deck");
  assert.ok(!("first_player" in first), "l'initiative est tirée par le moteur");
});
