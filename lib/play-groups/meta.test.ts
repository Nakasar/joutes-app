import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeOverview, type MetaSampleDeck } from "@/lib/meta/stats";
import {
  computeGroupMeta,
  groupMatchups,
  groupMetaFilterParams,
  harmonizeLegends,
  harmonizeSides,
  joutesSides,
  locatorSides,
  metaReference,
  readGroupMetaParams,
  resultsBetween,
  toSampleDeck,
  type GroupMatchSide,
  type GroupMetaResult,
} from "./meta";

/**
 * La méta d'un groupe : conversion des résultats en échantillon, bilans,
 * repère de la méta du jeu, confrontations.
 *
 * Exécution : `npm run test`.
 */

function result(overrides: Partial<GroupMetaResult>): GroupMetaResult {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    userId: "u1",
    gameId: "rb",
    source: "declared",
    name: "Nexus Night",
    date: "2026-11-01T18:00:00.000Z",
    domains: [],
    ...overrides,
  };
}

describe("paramètres de la vue Méta", () => {
  it("lit l'onglet en français, et `comparer=0` éteint la comparaison", () => {
    assert.deepEqual(readGroupMetaParams({ onglet: "confrontations", jeu: "rb", ext: "OGN", membre: "u2", comparer: "0" }), {
      tab: "matchups",
      compare: false,
      gameId: "rb",
      ext: "OGN",
      userId: "u2",
    });
    assert.deepEqual(readGroupMetaParams({ onglet: "nimporte", ext: "../x" }), { tab: "overview", compare: true });
  });

  it("réécrit les mêmes clés, sans l'onglet par défaut", () => {
    assert.deepEqual(groupMetaFilterParams({ tab: "overview", compare: true, gameId: "rb" }), {
      jeu: "rb",
      onglet: undefined,
      ext: undefined,
      membre: undefined,
      comparer: undefined,
    });
  });
});

describe("échantillon du groupe", () => {
  it("fait d'un résultat un deck d'échantillon : tournoi pour source, membre pour pilote", () => {
    const deck = toSampleDeck(
      result({ id: "r1", tournamentRef: "joutes:t1", placement: 3, legendCardId: "kaisa", domains: ["Fury", "Mind"] }),
      [{ cardId: "c1", quantity: 3 }],
    );
    assert.deepEqual(deck, {
      id: "r1",
      name: "Nexus Night",
      legendCardId: "kaisa",
      domains: ["Fury", "Mind"],
      source: "joutes:t1",
      eventDate: "2026-11-01T18:00:00.000Z",
      placement: "3",
      pilot: "u1",
      cards: [{ cardId: "c1", quantity: 3 }],
    });
  });

  it("garde les résultats de la période, bornes comprises", () => {
    const rows = [result({ date: "2026-10-23T10:00:00Z" }), result({ date: "2026-10-22T23:00:00Z" })];
    assert.equal(resultsBetween(rows, "2026-10-23").length, 1);
    assert.equal(resultsBetween(rows, undefined, "2026-10-22").length, 1);
  });

  it("rattache une légende saisie par son nom à la carte d'un autre résultat", () => {
    const [first, second] = harmonizeLegends([
      result({ legendCardId: "kaisa", legendName: "Kai'Sa" }),
      result({ legendName: "kai'sa" }),
    ]);
    assert.equal(first.legendCardId, "kaisa");
    assert.equal(second.legendCardId, "kaisa");
  });

  it("rattache aussi une légende saisie par le seul nom du champion", () => {
    const [, second] = harmonizeLegends([
      result({ legendCardId: "riven", legendName: "Riven, The Exile" }),
      result({ legendName: "riven" }),
    ]);
    assert.equal(second.legendCardId, "riven");
  });
});

describe("méta du groupe", () => {
  const rows = [
    result({ userId: "u1", legendCardId: "kaisa", legendName: "Kai'Sa", domains: ["Fury", "Mind"], placement: 1, record: { wins: 5, losses: 1, draws: 0 }, tournamentRef: "t1" }),
    result({ userId: "u2", legendCardId: "kaisa", legendName: "Kai'Sa", domains: ["Fury", "Mind"], placement: 12, record: { wins: 3, losses: 3, draws: 0 }, tournamentRef: "t1" }),
    result({ userId: "u2", legendCardId: "riven", legendName: "Riven", domains: ["Calm", "Chaos"], record: { wins: 2, losses: 2, draws: 0 }, tournamentRef: "t2" }),
  ];

  it("compte participations, tournois, top 8 et bilan du groupe", () => {
    const meta = computeGroupMeta(rows, {});
    assert.equal(meta.totals.participations, 3);
    assert.equal(meta.totals.tournaments, 2);
    assert.equal(meta.totals.members, 2);
    assert.equal(meta.totals.topEights, 1);
    assert.equal(meta.totals.matches, 16);
    assert.equal(meta.totals.rate, 10 / 16);
  });

  it("donne à chaque légende sa part, son bilan et ses membres", () => {
    const [kaisa, riven] = computeGroupMeta(rows, {}).legends;
    assert.equal(kaisa.key, "kaisa");
    assert.equal(kaisa.share, 2 / 3);
    assert.deepEqual(kaisa.userIds.sort(), ["u1", "u2"]);
    assert.equal(kaisa.matches, 12);
    assert.equal(kaisa.rate, 8 / 12);
    // Moins de 10 matchs : pas de winrate.
    assert.equal(riven.rate, undefined);
  });

  it("résume chaque membre : tournois, top 8, meilleur classement, légendes", () => {
    const members = computeGroupMeta(rows, {}).members;
    const u2 = members.find((member) => member.userId === "u2");
    assert.equal(u2?.tournaments, 2);
    assert.equal(u2?.best, 12);
    assert.equal(u2?.topEights, 0);
    assert.deepEqual(u2?.legends.sort(), ["kaisa", "riven"]);
  });

  it("compare à la méta du jeu : par carte, sinon par nom court", () => {
    const sample: MetaSampleDeck[] = [
      { id: "a", name: "", legendCardId: "kaisa-alt", legendName: "Kai'Sa, Daughter of the Void", domains: ["Fury", "Mind"], source: "s", eventDate: "2026-11-01", cards: [] },
      { id: "b", name: "", legendCardId: "riven", legendName: "Riven", domains: ["Calm", "Chaos"], source: "s", eventDate: "2026-11-01", cards: [] },
      { id: "c", name: "", legendCardId: "riven", legendName: "Riven", domains: ["Calm", "Chaos"], source: "s", eventDate: "2026-11-01", cards: [] },
      { id: "d", name: "", legendCardId: "riven", legendName: "Riven", domains: ["Calm", "Chaos"], source: "s", eventDate: "2026-11-01", cards: [] },
    ];
    const reference = metaReference(computeOverview(sample, {}, []));
    const meta = computeGroupMeta(rows, {}, new Map(), reference);
    assert.equal(meta.legends.find((legend) => legend.key === "riven")?.metaShare, 3 / 4);
    assert.equal(meta.legends.find((legend) => legend.key === "kaisa")?.metaShare, 1 / 4);
    assert.equal(meta.domains.find((domain) => domain.domain === "Fury")?.metaShare, 1 / 4);
    assert.equal(reference.legendShare({ name: "Jinx" }), 0);
  });
});

describe("confrontations", () => {
  it("lit les matchs du locator du côté des inscriptions reconnues", () => {
    const sides = locatorSides(
      {
        id: "e",
        source: "e",
        eventDate: "2026-11-01",
        players: [
          { id: 1, name: "Moi", record: "1-0-0", legend: "Kai'Sa", domains: [] },
          { id: 2, name: "Autre", record: "0-1-0", legend: "Riven", domains: [] },
          { id: 3, name: "Bye", record: "", domains: [] },
        ],
        matches: [
          { round: 1, phase: "swiss", a: 2, b: 1, winner: "b", games: [0, 2] },
          { round: 2, phase: "swiss", a: 1, winner: "a", games: [2, 0] },
        ],
      },
      new Map([[1, "u1"]]),
    );
    assert.deepEqual(sides, [{ userId: "u1", legend: "Kai'Sa", opponentLegend: "Riven", opponentIsMember: false, result: "W" }]);
  });

  it("lit les matchs Joutes : double défaite, nul, adversaire membre", () => {
    const userOf = new Map([
      ["p1", "u1"],
      ["p2", "u2"],
      ["p3", "x"],
    ]);
    const legendOf = new Map([["p3", { name: "Riven", cardId: "riven" }]]);
    const sides = joutesSides(
      [
        { players: [{ playerId: "p1" }, { playerId: "p3" }], winnerIds: [], status: "completed" },
        { players: [{ playerId: "p1" }, { playerId: "p2" }], winnerIds: ["p2"], status: "completed" },
        { players: [{ playerId: "p1" }, { playerId: "p3" }], winnerIds: [], status: "completed", resolution: "double-loss" },
        { players: [{ playerId: "p1" }, { playerId: "p3" }], winnerIds: ["p1"], status: "in_progress" },
      ],
      userOf,
      legendOf,
      new Set(["u1", "u2"]),
    );
    assert.deepEqual(
      sides.map((side) => [side.userId, side.result, side.opponentIsMember, side.opponentLegend]),
      [
        ["u1", "D", false, "Riven"],
        ["u1", "L", true, undefined],
        ["u2", "W", true, undefined],
        ["u1", "L", false, "Riven"],
      ],
    );
  });

  it("ne compte ni les matchs entre membres, ni les miroirs, ni une légende adverse inconnue", () => {
    const side = (overrides: Partial<GroupMatchSide>): GroupMatchSide => ({
      userId: "u1",
      legend: "Kai'Sa",
      opponentLegend: "Riven",
      opponentIsMember: false,
      result: "W",
      ...overrides,
    });
    const matchups = groupMatchups([
      side({}),
      side({ result: "L" }),
      side({ opponentIsMember: true }),
      side({ opponentLegend: "kai'sa" }),
      side({ opponentLegend: undefined }),
      side({ userId: "u2", result: "D" }),
    ]);
    assert.equal(matchups.known, 6);
    assert.equal(matchups.counted, 3);
    assert.deepEqual(
      matchups.opponents.map((row) => [row.legend, row.wins, row.losses, row.draws]),
      [["Riven", 1, 1, 1]],
    );
    assert.equal(groupMatchups([side({}), side({ userId: "u2" })], "u2").counted, 1);
  });

  it("réunit une légende adverse lue avec sa carte (Joutes) et sans (locator)", () => {
    const side = (overrides: Partial<GroupMatchSide>): GroupMatchSide => ({
      userId: "u1",
      legend: "Kai'Sa",
      opponentLegend: "Viktor, Herald of the Arcane",
      opponentIsMember: false,
      result: "W",
      ...overrides,
    });
    const matchups = groupMatchups([side({ opponentLegendCardId: "viktor" }), side({ opponentLegend: "Viktor", result: "L" })]);
    assert.deepEqual(
      matchups.opponents.map((row) => [row.legend, row.cardId, row.wins, row.losses]),
      [["Viktor, Herald of the Arcane", "viktor", 1, 1]],
    );
    assert.equal(matchups.pairings.length, 1);
  });

  it("donne sa carte à une légende adverse lue par son seul nom", () => {
    const [side] = harmonizeSides(
      [{ userId: "u1", legend: "Kai'Sa", opponentLegend: "Annie", opponentIsMember: false, result: "W" } as GroupMatchSide],
      [{ cardId: "annie", name: "Annie, Dark Child" }, { cardId: "kaisa", name: "Kai'Sa, Daughter of the Void" }],
    );
    assert.equal(side.opponentLegendCardId, "annie");
    assert.equal(side.legendCardId, "kaisa");
  });
});
