import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { byTurn, clock, exportJournal, reportOf, type Entry } from "./journal.ts";

const entry = (id: number, time: number, turn: number, seat: number, kind: Entry["kind"], more: Partial<Entry> = {}): Entry => ({
  id,
  time,
  turn,
  seat,
  kind,
  lines: [],
  ...more,
});

describe("journal de la table filmée", () => {
  it("écrit une durée en minutes et secondes", () => {
    assert.equal(clock(0), "00:00");
    assert.equal(clock(754.9), "12:34");
  });

  it("compte les écarts, leurs issues et la part expliquée sans question", () => {
    const entries = [
      entry(1, 10, 1, 0, "explained"),
      entry(2, 20, 1, 0, "explained"),
      entry(3, 40, 2, 1, "deviation", { resolution: "repaired" }),
      entry(4, 55, 2, 1, "question", { resolution: "answered" }),
      entry(5, 70, 3, 0, "deviation", { resolution: "table" }),
      entry(6, 80, 3, 0, "note"),
    ];
    const report = reportOf(entries, 100);
    assert.equal(report.duration, 90);
    assert.equal(report.turns, 3);
    assert.equal(report.deviations, 2);
    assert.equal(report.repaired, 1);
    assert.equal(report.tableRight, 1);
    assert.equal(report.questions, 1);
    assert.equal(report.explainedShare, 40);
    assert.deepEqual(report.segments, [
      { turn: 1, seat: 0, start: 10, end: 40 },
      { turn: 2, seat: 1, start: 40, end: 70 },
      { turn: 3, seat: 0, start: 70, end: 100 },
    ]);
    assert.equal(byTurn(entries).length, 3);
  });

  it("rend un rapport vide sans entrée", () => {
    const report = reportOf([], 0);
    assert.equal(report.explainedShare, 0);
    assert.deepEqual(report.segments, []);
  });

  it("exporte le journal sans les adresses d'images", () => {
    const text = exportJournal([entry(1, 3, 1, 0, "explained", { shot: "blob:x", lines: ["Ada joue."] })], { game: "riftbound" });
    assert.ok(!text.includes("blob:"));
    assert.deepEqual(JSON.parse(text).entries[0].lines, ["Ada joue."]);
  });
});
