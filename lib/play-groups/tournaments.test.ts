import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGroupTimeline,
  fillGroupTimeline,
  groupLegends,
  groupPalmares,
  previousMonth,
  readGroupTournamentFilters,
} from "./tournaments";
import type { TournamentResult } from "@/lib/types/TournamentResult";

/**
 * La vue Tournois d'un groupe : filtres de l'adresse, timeline paginée par
 * mois entiers, palmarès.
 *
 * Exécution : `npm run test`.
 */

function result(overrides: Partial<TournamentResult>): TournamentResult {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    userId: "u1",
    gameId: "rb",
    source: "joutes",
    sourceRef: "joutes:t1",
    tournamentRef: "joutes:t1",
    name: "Tournoi",
    date: "2026-11-01T10:00:00.000Z",
    domains: [],
    visibility: "public",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("filtres de la vue Tournois", () => {
  it("lit les clés courtes et refuse un mois mal écrit", () => {
    assert.deepEqual(readGroupTournamentFilters({ jeu: "rb", membre: "u2", top8: "1", avant: "2026-09" }), {
      gameId: "rb",
      userId: "u2",
      topEight: true,
      before: "2026-09",
    });
    assert.deepEqual(readGroupTournamentFilters({ top8: "oui", avant: "2026-13" }), {});
  });

  it("remonte d'un mois, y compris en janvier", () => {
    assert.equal(previousMonth("2026-09"), "2026-08");
    assert.equal(previousMonth("2026-01"), "2025-12");
  });
});

describe("timeline du groupe", () => {
  const results = [
    result({ userId: "u1", tournamentRef: "joutes:a", date: "2026-11-02T00:00:00Z", placement: 1 }),
    result({ userId: "u2", tournamentRef: "joutes:a", date: "2026-11-02T00:00:00Z", placement: 5 }),
    result({ userId: "u1", tournamentRef: "joutes:b", date: "2026-10-10T00:00:00Z", placement: 12, legendName: "Kai'Sa" }),
    result({ userId: "u2", tournamentRef: "joutes:c", date: "2026-09-10T00:00:00Z", placement: 3, legendName: "Kai'Sa" }),
    result({ userId: "u2", tournamentRef: "joutes:d", date: "2026-09-01T00:00:00Z", legendName: "Jinx" }),
  ];

  it("réunit les membres d'un même tournoi et compte les participations", () => {
    const timeline = buildGroupTimeline(results, {});
    assert.equal(timeline.participations, 5);
    assert.equal(timeline.tournaments, 4);
    assert.equal(timeline.since, "2026-09");
    assert.deepEqual(
      timeline.months.map((month) => month.month),
      ["2026-11", "2026-10", "2026-09"],
    );
    assert.equal(timeline.months[0].tournaments[0].results.length, 2);
  });

  it("pagine par mois entiers", () => {
    const first = buildGroupTimeline(results, {}, 2);
    assert.deepEqual(
      first.months.map((month) => month.month),
      ["2026-11", "2026-10"],
    );
    assert.equal(first.nextBefore, "2026-09");

    const next = buildGroupTimeline(results, { before: first.nextBefore }, 2);
    assert.deepEqual(
      next.months.map((month) => month.month),
      ["2026-09"],
    );
    assert.equal(next.months[0].tournaments.length, 2);
    assert.equal(next.nextBefore, undefined);
  });

  it("filtre par top 8 et par légende", () => {
    assert.equal(buildGroupTimeline(results, { topEight: true }).participations, 3);
    assert.equal(buildGroupTimeline(results, { legendName: "Kai'Sa" }).participations, 2);
  });

  it("classe le palmarès et les légendes", () => {
    assert.deepEqual(
      groupPalmares(results).map((row) => [row.userId, row.wins, row.topEights, row.tournaments]),
      [
        ["u1", 1, 1, 2],
        ["u2", 0, 2, 3],
      ],
    );
    assert.deepEqual(groupLegends(results), [
      { name: "Kai'Sa", count: 2 },
      { name: "Jinx", count: 1 },
    ]);
  });
});

describe("page de la timeline en résultats complets", () => {
  it("remplace les résumés par les résultats lus, et écarte ceux qui ont disparu entre-temps", () => {
    const summaries = [
      result({ id: "a", userId: "u1", placement: 1 }),
      result({ id: "b", userId: "u2", placement: 2 }),
    ].map(({ id, userId, gameId, source, tournamentRef, name, date, placement }) => ({
      id,
      userId,
      gameId,
      source,
      tournamentRef,
      name,
      date,
      placement,
    }));
    const page = buildGroupTimeline(summaries, {});
    const full = new Map([["a", result({ id: "a", userId: "u1", placement: 1, deckId: "d1" })]]);

    const filled = fillGroupTimeline(page, full);
    assert.deepEqual(
      filled.months[0].tournaments[0].results.map((entry) => [entry.id, entry.deckId]),
      [["a", "d1"]],
    );
    assert.equal(filled.participations, 2);
  });
});
