import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COLORLESS,
  computeAssociations,
  computeCardStats,
  computeOverview,
  computeSetStats,
  computeStapleGroups,
  filterMetaDecks,
  isTopCut,
  type MetaCard,
  type MetaSampleDeck,
} from "./stats";

const cards: Record<string, MetaCard> = {
  L1: { id: "L1", name: "Jinx", domains: ["Fury", "Chaos"], setCode: "OGN" },
  L2: { id: "L2", name: "Viktor", domains: ["Mind", "Order"], setCode: "OGN" },
  F1: { id: "F1", name: "Cloth Armor", domains: ["Fury"], setCode: "OGN" },
  F1b: { id: "F1b", name: "Cloth Armor", domains: ["Fury"], setCode: "SFD" },
  C1: { id: "C1", name: "Rebuke", domains: ["Chaos"], setCode: "SFD" },
  M1: { id: "M1", name: "Thinking Ahead", domains: ["Mind"], setCode: "SFD" },
  N1: { id: "N1", name: "Neeko", domains: [], setCode: "RAD" },
  P1: { id: "P1", name: "Pair Card", domains: ["Fury", "Chaos"], setCode: "RAD" },
};

let next = 0;
function deck(partial: Partial<MetaSampleDeck> & { cards: MetaSampleDeck["cards"] }): MetaSampleDeck {
  next += 1;
  return {
    id: `d${next}`,
    name: `Deck ${next}`,
    domains: ["Fury", "Chaos"],
    legendCardId: "L1",
    source: "Regional Lyon",
    eventDate: "2026-11-01T00:00:00.000Z",
    ...partial,
  };
}

// 4 decks Jinx (Fury/Chaos), 2 decks Viktor (Mind/Order).
const decks: MetaSampleDeck[] = [
  deck({ placement: "1er", cards: [{ cardId: "F1", quantity: 3 }, { cardId: "C1", quantity: 2 }, { cardId: "N1", quantity: 1 }, { cardId: "P1", quantity: 1 }] }),
  deck({ placement: "Top 8", cards: [{ cardId: "F1b", quantity: 3 }, { cardId: "C1", quantity: 3 }, { cardId: "N1", quantity: 2 }, { cardId: "P1", quantity: 1 }] }),
  deck({ placement: "9e-16e", cards: [{ cardId: "F1", quantity: 2 }, { cardId: "N1", quantity: 1 }, { cardId: "P1", quantity: 1 }] }),
  deck({ source: "Open Paris", cards: [{ cardId: "F1", quantity: 3 }, { cardId: "C1", quantity: 1 }, { cardId: "N1", quantity: 1 }] }),
  deck({ legendCardId: "L2", domains: ["Mind", "Order"], cards: [{ cardId: "M1", quantity: 3 }, { cardId: "N1", quantity: 1 }] }),
  deck({ legendCardId: "L2", domains: ["Mind", "Order"], eventDate: "2026-08-01T00:00:00.000Z", cards: [{ cardId: "M1", quantity: 2 }] }),
];

const now = new Date("2026-11-08T00:00:00.000Z");

describe("filterMetaDecks", () => {
  it("filtre par période, source, légende et domaine", () => {
    assert.equal(filterMetaDecks(decks, { periodDays: 30 }, now).length, 5);
    assert.equal(filterMetaDecks(decks, { periodDays: 0 }, now).length, 6);
    assert.equal(filterMetaDecks(decks, { periodDays: 0, source: "Open Paris" }, now).length, 1);
    assert.equal(filterMetaDecks(decks, { periodDays: 0, legend: "L2" }, now).length, 2);
    assert.equal(filterMetaDecks(decks, { periodDays: 0, domain: "Chaos" }, now).length, 4);
  });
});

describe("computeCardStats", () => {
  const stats = computeCardStats(decks, cards);
  const byName = new Map(stats.map((stat) => [stat.name, stat]));

  it("compte une carte par nom, toutes impressions confondues", () => {
    const armor = byName.get("Cloth Armor")!;
    assert.equal(armor.decks, 4);
    assert.equal(armor.averageCopies, 11 / 4);
  });

  it("rapporte une carte à son domaine, et une incolore à tous les decks", () => {
    const rebuke = byName.get("Rebuke")!;
    assert.equal(rebuke.domainDecks, 4);
    assert.equal(rebuke.domainShare, 3 / 4);
    const neeko = byName.get("Neeko")!;
    assert.equal(neeko.domainDecks, 6);
    assert.equal(neeko.domainShare, 5 / 6);
    const pair = byName.get("Pair Card")!;
    assert.equal(pair.domainDecks, 4);
  });

  it("range les cartes de la plus jouée à la moins jouée", () => {
    assert.equal(stats[0].name, "Neeko");
  });
});

describe("computeStapleGroups", () => {
  const stats = computeCardStats(decks, cards);

  it("groupe les staples par domaine, paires et incolores à part", () => {
    const groups = computeStapleGroups(stats, decks, { threshold: 0.75, minDecks: 2 });
    const keys = groups.map((group) => group.key);
    assert.deepEqual(keys.slice(0, 4).sort(), ["Chaos", "Fury", "Mind", "Order"]);
    assert.equal(keys.at(-1), COLORLESS);
    assert.deepEqual(groups.find((group) => group.key === "Fury")!.staples.map((s) => s.name), ["Cloth Armor"]);
    assert.deepEqual(groups.find((group) => group.key === "Chaos + Fury")!.staples.map((s) => s.name), ["Pair Card"]);
    assert.deepEqual(groups.find((group) => group.key === COLORLESS)!.staples.map((s) => s.name), ["Neeko"]);
  });

  it("n'a pas de staple pour un domaine trop peu joué", () => {
    const groups = computeStapleGroups(stats, decks, { threshold: 0.75, minDecks: 3 });
    const mind = groups.find((group) => group.key === "Mind")!;
    assert.equal(mind.tooFew, true);
    assert.equal(mind.staples.length, 0);
  });

  it("signale les cartes juste sous le seuil", () => {
    const groups = computeStapleGroups(stats, decks, { threshold: 0.9, minDecks: 2 });
    const colorless = groups.find((group) => group.key === COLORLESS)!;
    assert.deepEqual(colorless.nearMisses.map((s) => s.name), ["Neeko"]);
  });
});

describe("computeOverview", () => {
  it("compte légendes, domaines, sources et la paire la plus jouée", () => {
    const stats = computeCardStats(decks, cards);
    const overview = computeOverview(decks, cards, stats);
    assert.equal(overview.decks, 6);
    assert.equal(overview.sources, 2);
    assert.equal(overview.legends[0].name, "Jinx");
    assert.equal(overview.legends[0].decks, 4);
    assert.equal(overview.legends[0].topCuts, 2);
    assert.deepEqual(overview.topPair?.domains, ["Chaos", "Fury"]);
    assert.equal(overview.cardsPlayed, 5);
  });

  it("lit les classements de top 8", () => {
    assert.equal(isTopCut("1er"), true);
    assert.equal(isTopCut("5e-8e"), true);
    assert.equal(isTopCut("Top 8"), true);
    assert.equal(isTopCut("Top 16"), false);
    assert.equal(isTopCut("9e-16e"), false);
    assert.equal(isTopCut(undefined), false);
  });
});

describe("computeAssociations", () => {
  it("compare la part avec la carte à la part habituelle", () => {
    const stats = computeCardStats(decks, cards);
    const result = computeAssociations(decks, cards, stats, "Rebuke")!;
    assert.equal(result.legends[0].name, "Jinx");
    const armor = result.often.find((item) => item.name === "Cloth Armor")!;
    assert.equal(armor.withShare, 1);
    assert.equal(armor.lift, 1 / (4 / 6));
    assert.ok(!result.often.some((item) => item.name === "Rebuke"));
    assert.ok(result.rarely.some((item) => item.name === "Thinking Ahead"));
  });

  it("ne rend rien pour une carte absente", () => {
    const stats = computeCardStats(decks, cards);
    assert.equal(computeAssociations(decks, cards, stats, "Inconnue"), null);
  });
});

describe("computeSetStats", () => {
  it("répartit les exemplaires et les staples par extension", () => {
    const stats = computeCardStats(decks, cards);
    const sets = computeSetStats(
      decks,
      { cards, setTotals: { OGN: 300, SFD: 200 }, setNames: { OGN: "Origins" } },
      stats,
      { threshold: 0.75, minDecks: 2 }
    );
    const ogn = sets.find((set) => set.setCode === "OGN")!;
    assert.equal(ogn.name, "Origins");
    assert.equal(ogn.total, 300);
    assert.equal(ogn.staples, 1);
    assert.deepEqual(ogn.staplesByDomain, { Fury: 1 });
    const rad = sets.find((set) => set.setCode === "RAD")!;
    assert.deepEqual(rad.staplesByDomain, { [COLORLESS]: 1, Chaos: 1, Fury: 1 });
    const totalShare = sets.reduce((sum, set) => sum + set.copiesShare, 0);
    assert.ok(Math.abs(totalShare - 1) < 1e-9);
  });
});
