import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMetaAppView, buildMetaTournamentAppView, readMetaAppParams } from "./app-view";
import { DEFAULT_META_SETTINGS } from "./settings";
import type { MetaEventMatches } from "./match-stats";
import type { MetaCard, MetaSample, MetaSampleDeck } from "./stats";

const cards: Record<string, MetaCard> = {
  L1: { id: "L1", name: "Jinx", domains: ["Fury", "Chaos"], setCode: "OGN", image: "jinx.png" },
  L2: { id: "L2", name: "Viktor", domains: ["Mind", "Order"], setCode: "OGN" },
  F1: { id: "F1", name: "Cloth Armor", domains: ["Fury"], setCode: "OGN" },
  M1: { id: "M1", name: "Thinking Ahead", domains: ["Mind"], setCode: "SFD" },
};

let next = 0;
function deck(partial: Partial<MetaSampleDeck>): MetaSampleDeck {
  next += 1;
  return {
    id: `d${next}`,
    name: `Deck ${next}`,
    domains: ["Fury", "Chaos"],
    legendCardId: "L1",
    source: "Regional Lyon",
    eventDate: "2026-11-01T00:00:00.000Z",
    cards: [{ cardId: "F1", quantity: 3 }],
    ...partial,
  };
}

const sample: MetaSample = {
  decks: [
    deck({ placement: "Top 8", pilot: "Alice" }),
    deck({ placement: "1er", pilot: "Bob" }),
    deck({ legendCardId: "L2", domains: ["Mind", "Order"], cards: [{ cardId: "M1", quantity: 2 }] }),
    deck({ legendCardId: "L2", domains: ["Mind", "Order"], eventDate: "2026-06-01T00:00:00.000Z", source: "Open Paris" }),
  ],
  cards,
  setTotals: { OGN: 300 },
  setNames: { OGN: "Origins", SFD: "Spiritforged" },
};

const events: MetaEventMatches[] = [
  {
    id: "e1",
    source: "Regional Lyon",
    eventDate: "2026-11-01T00:00:00.000Z",
    players: [
      { id: 1, name: "Alice", place: 1, record: "1-0-0", legend: "Jinx", domains: ["Fury", "Chaos"] },
      { id: 2, name: "Carl", place: 2, record: "0-1-0", legend: "Viktor", domains: ["Mind", "Order"] },
    ],
    matches: [{ round: 1, phase: "swiss", a: 1, b: 2, winner: "a", games: [2, 0] }],
  },
];

const now = new Date("2026-11-08T00:00:00.000Z");

describe("readMetaAppParams", () => {
  it("garde une période proposée et retombe sur celle du jeu sinon", () => {
    assert.equal(readMetaAppParams(new URLSearchParams("period=90"), DEFAULT_META_SETTINGS).periodDays, 90);
    assert.equal(readMetaAppParams(new URLSearchParams("period=13"), DEFAULT_META_SETTINGS).periodDays, 30);
    assert.equal(readMetaAppParams(new URLSearchParams(""), DEFAULT_META_SETTINGS).periodDays, 30);
    assert.equal(readMetaAppParams(new URLSearchParams("period=0&legend=L1"), DEFAULT_META_SETTINGS).legend, "L1");
  });
});

describe("buildMetaAppView", () => {
  const view = buildMetaAppView({ sample, events, settings: DEFAULT_META_SETTINGS, params: { periodDays: 30 }, now });

  it("compte les decks de la période et garde tout l'échantillon pour le résumé", () => {
    assert.equal(view.totalDecks, 4);
    assert.equal(view.overview.decks, 3);
    assert.equal(view.latestDate, "2026-11-01");
    assert.equal(view.overview.legends[0].name, "Jinx");
  });

  it("liste les légendes de la période pour le filtre", () => {
    assert.deepEqual(view.filters.legends.map((legend) => [legend.label, legend.decks]), [["Jinx", 2], ["Viktor", 1]]);
  });

  it("garde dans le filtre une légende choisie sans deck dans la période", () => {
    const filtered = buildMetaAppView({ sample, events, settings: DEFAULT_META_SETTINGS, params: { periodDays: 7, legend: "L9" }, now });
    assert.ok(filtered.filters.legends.some((legend) => legend.value === "L9" && legend.decks === 0));
    assert.equal(filtered.overview.decks, 0);
  });

  it("donne les tournois de la période et les winrates hors miroir", () => {
    assert.equal(view.tournaments.length, 1);
    assert.equal(view.tournaments[0].winner?.pilot, "Bob");
    const jinx = view.winrates?.legends.find((legend) => legend.legend === "Jinx");
    assert.equal(jinx?.wins, 1);
    assert.equal(view.winrates?.period, null);
  });

  it("n'a pas de winrates sans tournoi importé avec ses matchs", () => {
    const noMatches = buildMetaAppView({ sample, events: [], settings: DEFAULT_META_SETTINGS, params: { periodDays: 0 }, now });
    assert.equal(noMatches.winrates, null);
    assert.equal(noMatches.decks.length, 4);
  });
});

describe("buildMetaTournamentAppView", () => {
  it("range les decks par classement et rattache les matchs du locator", () => {
    const view = buildMetaTournamentAppView({ sample, events, date: "2026-11-01", slug: "regional-lyon" });
    assert.ok(view);
    assert.deepEqual(view.decks.map((d) => d.pilot), ["Bob", "Alice", undefined]);
    assert.equal(view.matches?.players, 2);
  });

  it("rend null pour un tournoi inconnu", () => {
    assert.equal(buildMetaTournamentAppView({ sample, events, date: "2026-01-01", slug: "nope" }), null);
  });
});
