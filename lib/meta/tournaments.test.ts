import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MetaCard, MetaSampleDeck } from "./stats";
import {
  computeTournamentStats,
  findTournamentDecks,
  listTournaments,
  placementRank,
  placementTier,
  tournamentPath,
  tournamentSlug,
} from "./tournaments";

const cards: Record<string, MetaCard> = {
  L1: { id: "L1", name: "Rek'Sai", domains: ["Fury", "Order"] },
  L2: { id: "L2", name: "Kai'Sa", domains: ["Fury", "Mind"] },
  A: { id: "A", name: "Rebuke", domains: ["Order"] },
  B: { id: "B", name: "Cloth Armor", domains: ["Fury"] },
  B2: { id: "B2", name: "Cloth Armor", domains: ["Fury"] },
};

let next = 0;
function deck(partial: Partial<MetaSampleDeck> = {}): MetaSampleDeck {
  next += 1;
  return {
    id: `d${next}`,
    name: `Deck ${next}`,
    legendCardId: "L1",
    domains: ["Fury", "Order"],
    source: "RC Europe 2026",
    eventDate: "2026-11-09T00:00:00.000Z",
    cards: [],
    ...partial,
  };
}

describe("adresse d'un tournoi", () => {
  it("simplifie la source et garde le jour saisi", () => {
    assert.equal(tournamentSlug("RC Europe 2026"), "rc-europe-2026");
    assert.equal(tournamentSlug("  Régional d'Évry !"), "regional-d-evry");
    assert.equal(tournamentSlug("!!!"), "tournoi");
    assert.equal(
      tournamentPath("/games/riftbound/meta", "RC Europe 2026", "2026-11-09T00:00:00.000Z"),
      "/games/riftbound/meta/tournois/2026-11-09/rc-europe-2026"
    );
  });

  it("retrouve les decks par date et source, pas un homonyme d'un autre jour", () => {
    const decks = [deck(), deck({ eventDate: "2026-10-01T00:00:00.000Z" }), deck({ source: "Regional Lyon" })];
    assert.deepEqual(
      findTournamentDecks(decks, "2026-11-09", "rc-europe-2026").map((d) => d.id),
      [decks[0].id]
    );
  });
});

describe("classements", () => {
  it("lit le premier nombre, ou N dans « Top N »", () => {
    assert.equal(placementRank("1er"), 1);
    assert.equal(placementRank("3e-4e"), 3);
    assert.equal(placementRank("Top 8"), 8);
    assert.equal(placementRank("Swiss"), undefined);
    assert.equal(placementTier("5e-8e"), "top8");
    assert.equal(placementTier("Top 16"), "top16");
    assert.equal(placementTier("17e-32e"), "top32");
    assert.equal(placementTier("40e"), "rest");
    assert.equal(placementTier(undefined), "unranked");
  });
});

describe("computeTournamentStats", () => {
  const ranked = [
    deck({ placement: "1er", cards: [{ cardId: "A", quantity: 3 }] }),
    deck({ placement: "2e", legendCardId: "L2", domains: ["Fury", "Mind"], cards: [{ cardId: "A", quantity: 2 }] }),
    deck({ placement: "3e-4e", cards: [{ cardId: "A", quantity: 3 }] }),
    deck({ placement: "3e-4e", cards: [{ cardId: "A", quantity: 3 }, { cardId: "B", quantity: 1 }] }),
    deck({ placement: "9e-16e", legendCardId: "L2", domains: ["Fury", "Mind"], cards: [{ cardId: "B", quantity: 3 }] }),
    deck({ placement: "9e-16e", legendCardId: "L2", domains: ["Fury", "Mind"], cards: [{ cardId: "B2", quantity: 3 }] }),
    deck({ placement: "17e", legendCardId: "L2", domains: ["Fury", "Mind"], cards: [{ cardId: "B", quantity: 3 }] }),
    deck({ legendCardId: "L2", domains: ["Fury", "Mind"], cards: [{ cardId: "B", quantity: 3 }] }),
  ];
  const stats = computeTournamentStats(ranked, cards);

  it("compte les légendes, leur top 8 et leur conversion", () => {
    assert.equal(stats.decks, 8);
    assert.equal(stats.ranked, 7);
    const [kaisa, reksai] = stats.legends;
    assert.equal(kaisa.name, "Kai'Sa");
    assert.equal(kaisa.decks, 5);
    assert.equal(kaisa.topCuts, 1);
    assert.equal(kaisa.best, "2e");
    assert.equal(reksai.topCuts, 3);
    assert.equal(reksai.best, "1er");
    // 3 du top 8 sur 4 = 75 %, pour 3 decks sur 8 = 37,5 % du tournoi : ×2.
    assert.equal(reksai.conversion, 2);
    assert.deepEqual(stats.topCut.map((d) => d.placement), ["1er", "2e", "3e-4e", "3e-4e"]);
  });

  it("rapporte les domaines aux emplacements, chaque deck comptant pour ses deux domaines", () => {
    const fury = stats.domains.find((d) => d.domain === "Fury")!;
    assert.equal(fury.decks, 8);
    assert.equal(fury.slotShare, 0.5);
    assert.equal(fury.topSlotShare, 0.5);
    const order = stats.domains.find((d) => d.domain === "Order")!;
    assert.equal(order.topSlotShare, 3 / 8);
    assert.deepEqual(stats.pairs[0], { domains: ["Fury", "Mind"], decks: 5 });
  });

  it("range les légendes par palier", () => {
    assert.deepEqual(stats.tiers, [
      { tier: "top8", decks: 4 },
      { tier: "top16", decks: 2 },
      { tier: "top32", decks: 1 },
      { tier: "unranked", decks: 1 },
    ]);
    assert.deepEqual(stats.matrix.L2, [1, 2, 1, 1]);
    assert.deepEqual(stats.matrix.L1, [3, 0, 0, 0]);
  });

  it("repère les cartes qui séparent le top 8 du reste, impressions confondues", () => {
    assert.deepEqual(stats.cardsUp.map((c) => [c.name, c.top, c.rest]), [["Rebuke", 1, 0]]);
    assert.deepEqual(stats.cardsDown.map((c) => [c.name, c.top, c.rest]), [["Cloth Armor", 0.25, 1]]);
  });

  it("se passe de top 8 quand aucun classement n'est saisi", () => {
    const plain = computeTournamentStats([deck(), deck({ legendCardId: "L2", domains: ["Fury", "Mind"] })], cards);
    assert.equal(plain.topCut.length, 0);
    assert.equal(plain.legends[0].conversion, undefined);
    assert.deepEqual(plain.tiers, [{ tier: "unranked", decks: 2 }]);
    assert.deepEqual(plain.cardsUp, []);
  });
});

describe("listTournaments", () => {
  it("regroupe par jour et source, les plus récents d'abord", () => {
    const decks = [
      deck({ placement: "1er", pilot: "Hugo" }),
      deck({ legendCardId: "L2", domains: ["Fury", "Mind"] }),
      deck(),
      deck({ source: "Regional Lyon", eventDate: "2026-11-02T00:00:00.000Z" }),
    ];
    const list = listTournaments(decks, cards);
    assert.equal(list.length, 2);
    assert.equal(list[0].source, "RC Europe 2026");
    assert.equal(list[0].decks, 3);
    assert.deepEqual(list[0].winner, { deckId: decks[0].id, legend: "Rek'Sai", pilot: "Hugo" });
    assert.equal(list[0].topLegend?.name, "Rek'Sai");
    assert.deepEqual(list[0].topDomains[0], { domain: "Fury", share: 1 });
    assert.equal(list[1].winner, undefined);
  });
});
