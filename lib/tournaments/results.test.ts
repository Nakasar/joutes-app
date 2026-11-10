import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bestRecentResult,
  buildJoutesResults,
  canSeeResult,
  finalPlacements,
  formatRecord,
  groupByMonth,
  groupByTournament,
  looksLikeUser,
  matchRecords,
  parseRecord,
  summarizeResults,
  topCutSize,
  validateDeclaredResult,
} from "./results";
import type { TournamentResult } from "@/lib/types/TournamentResult";

/**
 * Les résultats de tournoi : classement final d'un tournoi Joutes, bilans,
 * saisie déclarée, visibilité et timeline.
 *
 * Exécution : `npm run test`.
 */

const rows = (...ids: string[]) => ids.map((playerId) => ({ playerId }));

describe("finalPlacements", () => {
  it("classe le top cut d'abord, puis les éliminés selon les rondes suisses", () => {
    const placements = finalPlacements([
      { order: 0, standings: rows("a", "b", "c", "d", "e", "f") },
      { order: 1, standings: rows("c", "a", "b", "d") },
    ]);

    assert.deepEqual(placements.order, ["c", "a", "b", "d", "e", "f"]);
    assert.equal(placements.topCut, 4);
    assert.ok(placements.inTopCut.has("d") && !placements.inTopCut.has("e"));
  });

  it("n'invente pas de top cut pour une seule phase", () => {
    const placements = finalPlacements([{ order: 0, standings: rows("a", "b") }, { order: 1, standings: [] }]);
    assert.deepEqual(placements.order, ["a", "b"]);
    assert.equal(placements.topCut, undefined);
  });
});

describe("matchRecords", () => {
  it("compte victoires, défaites, nuls et doubles défaites, sans les byes", () => {
    const records = matchRecords([
      { players: rows("a", "b"), winnerIds: ["a"], status: "completed" },
      { players: rows("a", "c"), winnerIds: [], status: "completed" },
      { players: rows("b", "c"), winnerIds: [], status: "completed", resolution: "double-loss" },
      { players: rows("a"), winnerIds: ["a"], status: "completed" },
      { players: rows("a", "b"), winnerIds: [], status: "pending" },
    ]);

    assert.deepEqual(records.get("a"), { wins: 1, losses: 0, draws: 1 });
    assert.deepEqual(records.get("b"), { wins: 0, losses: 2, draws: 0 });
    assert.deepEqual(records.get("c"), { wins: 0, losses: 1, draws: 1 });
  });
});

describe("buildJoutesResults", () => {
  it("écrit un résultat par compte classé, avec son top cut", () => {
    const placements = finalPlacements([
      { order: 0, standings: rows("p1", "p2", "p3") },
      { order: 1, standings: rows("p2", "p1") },
    ]);
    const results = buildJoutesResults(
      { id: "t1", name: "Nexus Night", gameId: "rb", date: "2026-11-01T18:00:00.000Z", place: "Le Dé Pipé" },
      [
        { id: "p1", userId: "lisa" },
        { id: "p2", userId: "mehdi" },
        { id: "p3" },
        { id: "p4", userId: "absent" },
      ],
      placements,
      new Map([["p2", { wins: 3, losses: 0, draws: 0 }]]),
    );

    assert.deepEqual(
      results.map((result) => [result.userId, result.placement, result.topCut, result.playerCount]),
      [
        ["mehdi", 1, 2, 3],
        ["lisa", 2, 2, 3],
      ],
    );
    assert.equal(results[0].sourceRef, "joutes:t1");
    assert.deepEqual(results[0].record, { wins: 3, losses: 0, draws: 0 });
  });
});

describe("parseRecord / formatRecord", () => {
  it("lit le bilan du locator et l'écrit sans nul inutile", () => {
    assert.deepEqual(parseRecord("6-2-1"), { wins: 6, losses: 2, draws: 1 });
    assert.equal(parseRecord("n/a"), undefined);
    assert.equal(formatRecord({ wins: 4, losses: 1, draws: 0 }), "4-1");
    assert.equal(formatRecord({ wins: 6, losses: 2, draws: 1 }), "6-2-1");
  });
});

describe("validateDeclaredResult", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const base = { name: "  Store   Showdown ", date: "2026-10-25", gameId: "swu" };

  it("nettoie une saisie minimale et garde « groupes » par défaut", () => {
    const result = validateDeclaredResult(base, now);
    assert.ok(result.ok);
    assert.equal(result.value.name, "Store Showdown");
    assert.equal(result.value.visibility, "groups");
  });

  it("refuse un tournoi à venir, un classement hors du nombre de joueurs, un top cut farfelu", () => {
    assert.deepEqual(validateDeclaredResult({ ...base, date: "2026-12-01" }, now), { ok: false, error: "DATE" });
    assert.deepEqual(validateDeclaredResult({ ...base, playerCount: 10, placement: 12 }, now), {
      ok: false,
      error: "PLACEMENT",
    });
    assert.deepEqual(validateDeclaredResult({ ...base, topCut: 6 }, now), { ok: false, error: "TOP_CUT" });
    assert.deepEqual(validateDeclaredResult({ ...base, placement: 9, topCut: 8 }, now), { ok: false, error: "TOP_CUT" });
  });

  it("complète un bilan partiel", () => {
    const result = validateDeclaredResult({ ...base, record: { wins: 4, losses: 1 } }, now);
    assert.ok(result.ok);
    assert.deepEqual(result.value.record, { wins: 4, losses: 1, draws: 0 });
  });
});

describe("canSeeResult", () => {
  it("montre un résultat de groupe aux seuls membres d'un groupe commun", () => {
    const result = { userId: "camille", visibility: "groups" as const };
    assert.equal(canSeeResult(result, "camille", false), true);
    assert.equal(canSeeResult(result, "lisa", true), true);
    assert.equal(canSeeResult(result, "lisa", false), false);
    assert.equal(canSeeResult({ ...result, visibility: "public" }, null, false), true);
  });
});

function result(id: string, overrides: Partial<TournamentResult>): TournamentResult {
  return {
    id,
    userId: id,
    source: "joutes",
    sourceRef: `joutes:${id}`,
    name: "Nexus Night",
    date: "2026-11-01T18:00:00.000Z",
    domains: [],
    visibility: "public",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("groupByTournament / groupByMonth", () => {
  it("réunit par référence, sinon par nom et jour, et range par mois", () => {
    const tournaments = groupByTournament([
      result("lisa", { tournamentRef: "joutes:t1", placement: 5 }),
      result("mehdi", { tournamentRef: "joutes:t1", placement: 2, playerCount: 16 }),
      result("evan", { source: "declared", name: "Set Championship", date: "2026-10-18T00:00:00.000Z" }),
      result("camille", { source: "declared", name: "Set championship ", date: "2026-10-18T10:00:00.000Z", placement: 3 }),
    ]);

    assert.deepEqual(
      tournaments.map((tournament) => [tournament.name, tournament.results.map((entry) => entry.userId)]),
      [
        ["Nexus Night", ["mehdi", "lisa"]],
        ["Set Championship", ["camille", "evan"]],
      ],
    );
    assert.equal(tournaments[0].playerCount, 16);
    assert.deepEqual(
      groupByMonth(tournaments).map((month) => month.month),
      ["2026-11", "2026-10"],
    );
  });
});

describe("summarizeResults / bestRecentResult", () => {
  it("compte victoires, top 8 et tournois", () => {
    assert.deepEqual(
      summarizeResults([
        { placement: 1, tournamentRef: "a", name: "", date: "" },
        { placement: 6, tournamentRef: "a", name: "", date: "" },
        { placement: 12, tournamentRef: "b", name: "", date: "" },
      ]),
      { wins: 1, topEights: 2, tournaments: 2 },
    );
  });

  it("préfère le meilleur classement récent au plus récent", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    const best = bestRecentResult(
      [
        { placement: 9, date: "2026-11-05" },
        { placement: 2, date: "2026-10-01" },
        { placement: 1, date: "2025-01-01" },
      ],
      now,
    );
    assert.equal(best?.placement, 2);
  });
});

describe("C'est moi", () => {
  it("suggère « Thomas D. » à Thomas Durand, pas à Thomas Martin", () => {
    assert.equal(looksLikeUser("Thomas D.", ["Thomas Durand"]), true);
    assert.equal(looksLikeUser("Thomas D.", ["Thomas Martin"]), false);
    assert.equal(looksLikeUser("thomas", ["Thomas Durand"]), true);
    assert.equal(looksLikeUser("Thómas Durand", ["thomas durand"]), true);
    assert.equal(looksLikeUser("Lisa", ["Thomas Durand", "tdurand"]), false);
    assert.equal(looksLikeUser("tdurand", ["Thomas Durand", "tdurand"]), true);
  });

  it("arrondit la phase finale à la taille habituelle", () => {
    assert.equal(topCutSize(8), 8);
    assert.equal(topCutSize(7), 8);
    assert.equal(topCutSize(1), undefined);
    assert.equal(topCutSize(100), undefined);
  });
});
