import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeDeckDomains, isPlayableDomain } from "@/lib/decks/domains";

const domains: Record<string, string[]> = {
  reksai: ["Fury", "Order"],
  unit: ["Fury"],
  spell: ["Order"],
  bodySide: ["Body"],
  battlefield: ["Colorless"],
  neeko: [],
};
const domainsOf = (id: string) => domains[id];

describe("domaines d'un deck", () => {
  it("prend ceux de la légende, sans champs de bataille", () => {
    const cards = {
      legend: [{ cardId: "reksai", quantity: 1 }],
      maindeck: [{ cardId: "unit", quantity: 3 }, { cardId: "neeko", quantity: 1 }],
      battlefields: [{ cardId: "battlefield", quantity: 1 }],
      sideboard: [{ cardId: "bodySide", quantity: 2 }],
    };
    assert.deepEqual(computeDeckDomains(cards, domainsOf), ["Fury", "Order"]);
  });

  it("sans légende, réunit les cartes du deck et de la réserve, sans « Colorless »", () => {
    const cards = {
      maindeck: [{ cardId: "unit", quantity: 3 }, { cardId: "spell", quantity: 2 }],
      battlefields: [{ cardId: "battlefield", quantity: 1 }],
      sideboard: [{ cardId: "bodySide", quantity: 2 }],
    };
    assert.deepEqual(computeDeckDomains(cards, domainsOf), ["Body", "Fury", "Order"]);
  });

  it("une légende choisie à la main l'emporte", () => {
    assert.deepEqual(computeDeckDomains({ maindeck: [{ cardId: "unit", quantity: 1 }] }, domainsOf, "reksai"), ["Fury", "Order"]);
  });

  it("« Colorless » n'est pas un domaine", () => {
    assert.equal(isPlayableDomain("Colorless"), false);
    assert.equal(isPlayableDomain("Incolore"), false);
    assert.equal(isPlayableDomain("Fury"), true);
  });
});
