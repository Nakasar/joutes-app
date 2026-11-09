import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  domainWinrates,
  eventsBetween,
  facedLegends,
  legendMatchups,
  legendWinrates,
  matchTotals,
  mostLopsidedMatchup,
  playerRounds,
  shortLegendName,
  topCutPlayers,
  winrate,
  type MetaEventMatch,
  type MetaEventMatches,
  type MetaEventPlayer,
} from "./match-stats.ts";

const player = (id: number, legend: string | undefined, domains: string[], place?: number): MetaEventPlayer => ({
  id,
  name: `Joueur ${id}`,
  record: "0-0-0",
  domains,
  ...(legend ? { legend } : {}),
  ...(place !== undefined ? { place } : {}),
});

const match = (round: number, a: number, b: number | undefined, winner: "a" | "b" | null, phase: "swiss" | "top" = "swiss"): MetaEventMatch => ({
  round,
  phase,
  a,
  ...(b !== undefined ? { b } : {}),
  winner,
  games: winner === "a" ? [2, 0] : winner === "b" ? [0, 2] : [1, 1],
});

const event: MetaEventMatches = {
  id: "e1",
  source: "RC Test",
  eventDate: "2026-11-06T00:00:00.000Z",
  players: [
    player(1, "Riven, The Exile", ["Calm", "Chaos"], 1),
    player(2, "Kennen, Heart of the Tempest", ["Mind", "Order"], 2),
    player(3, "Riven, The Exile", ["Calm", "Chaos"], 3),
    player(4, undefined, [], 4),
  ],
  matches: [
    match(1, 1, 2, "a"),
    match(1, 3, 4, "a"),
    match(2, 1, 3, "b"), // miroir
    match(2, 2, undefined, "a"), // bye
    match(3, 2, 3, null),
    match(4, 1, 2, "b", "top"),
  ],
};

describe("winrates", () => {
  it("compte un nul pour une demi-victoire", () => {
    assert.equal(winrate({ wins: 1, losses: 0, draws: 1 }), 0.75);
    assert.equal(winrate({ wins: 0, losses: 0, draws: 0 }), undefined);
  });

  it("exclut miroirs, byes, légendes inconnues et, par défaut, le top", () => {
    const rows = legendWinrates([event]);
    const riven = rows.find((row) => row.legend === "Riven, The Exile");
    const kennen = rows.find((row) => row.legend === "Kennen, Heart of the Tempest");
    assert.deepEqual([riven?.wins, riven?.losses, riven?.draws, riven?.players, riven?.top8], [1, 0, 1, 2, 2]);
    assert.deepEqual([kennen?.wins, kennen?.losses, kennen?.draws], [0, 1, 1]);
    assert.equal(rows.length, 2);
  });

  it("compte le top sur demande", () => {
    const kennen = legendWinrates([event], { includeTop: true }).find((row) => row.legend.startsWith("Kennen"));
    assert.deepEqual([kennen?.wins, kennen?.losses, kennen?.draws], [1, 1, 1]);
  });

  it("ne compte pas un domaine que les deux decks partagent", () => {
    const rows = domainWinrates([event]);
    const calm = rows.find((row) => row.domain === "Calm");
    // 1-2 (gagné), 3-4 (adversaire sans domaine : gagné), 2-3 (nul) ; le miroir 1-3 ne compte pas.
    assert.deepEqual([calm?.wins, calm?.losses, calm?.draws], [2, 0, 1]);
  });

  it("donne les matchups vus de chaque légende et le plus déséquilibré", () => {
    const table = legendMatchups([event]);
    assert.deepEqual(table.get("Riven, The Exile")?.get("Kennen, Heart of the Tempest"), { wins: 1, losses: 0, draws: 1 });
    assert.equal(table.get("Riven, The Exile")?.has("Riven, The Exile"), false);
    // Moins de 20 matchs : rien n'est mis en avant.
    assert.equal(mostLopsidedMatchup(table), undefined);
  });
});

describe("parcours", () => {
  it("donne les rondes d'un joueur dans l'ordre, byes compris, vues de lui", () => {
    const rounds = playerRounds(event, 2);
    assert.deepEqual(
      rounds.map((round) => [round.round, round.result, round.opponent?.id, round.games]),
      [
        [1, "L", 1, [0, 2]],
        [2, "BYE", undefined, [0, 0]],
        [3, "D", 3, [1, 1]],
        [4, "W", 1, [2, 0]],
      ]
    );
  });

  it("résume les légendes affrontées par le top", () => {
    const top = topCutPlayers(event, 2);
    assert.deepEqual(
      top.map((entry) => entry.id),
      [1, 2]
    );
    const faced = facedLegends(
      event,
      top.map((entry) => entry.id)
    );
    assert.deepEqual(
      faced.map((row) => [shortLegendName(row.legend), row.matches, row.wins, row.losses, row.draws]),
      [
        ["Riven", 4, 1, 2, 1],
        ["Kennen", 2, 1, 1, 0],
      ]
    );
  });

  it("compte matchs, nuls, byes et rondes", () => {
    assert.deepEqual(matchTotals([event]), { matches: 5, draws: 1, byes: 1, rounds: 4 });
  });

  it("filtre les tournois par jour, bornes comprises", () => {
    assert.equal(eventsBetween([event], "2026-11-06", "2026-11-06").length, 1);
    assert.equal(eventsBetween([event], "2026-11-07").length, 0);
    assert.equal(eventsBetween([event], undefined, "2026-11-05").length, 0);
  });
});
