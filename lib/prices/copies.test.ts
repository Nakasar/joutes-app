import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copyPriceKey, pickMarketPrice, printingMarketPrice, type PriceRecord } from "./copies";

/**
 * Prix d'un exemplaire : sa variante d'impression quand elle est cotée à part,
 * sinon sa carte.
 *
 * Exécution : `npm run test`.
 */

const sourceUpdatedAt = new Date("2026-09-20T03:00:00Z");

const cardnexus: PriceRecord = {
  source: "cardnexus",
  currency: "EUR",
  prices: { trend: 0.5 },
  offers: [{ productId: 1, productName: "Retail", finish: "Standard", prices: { trend: 0.5 } }],
  printings: {
    beta: {
      prices: { low: 30, trend: 42 },
      offers: [{ productId: 2, productName: "Beta", finish: "Foil", prices: { low: 30, trend: 42 } }],
    },
  },
  sourceUpdatedAt,
};

const cardmarket: PriceRecord = {
  source: "cardmarket",
  currency: "EUR",
  prices: { trend: 0.8 },
  offers: [{ productId: 9, productName: "Retail", prices: { trend: 0.8 } }],
  sourceUpdatedAt,
};

describe("copyPriceKey", () => {
  it("distingue une variante de la version de base", () => {
    assert.equal(copyPriceKey("WNC-141"), "WNC-141");
    assert.notEqual(copyPriceKey("WNC-141", "beta"), copyPriceKey("WNC-141"));
  });
});

describe("pickMarketPrice", () => {
  const order = ["cardnexus", "cardmarket"] as const;

  it("prend le prix de la variante quand elle est cotée à part", () => {
    const price = pickMarketPrice([cardnexus, cardmarket], order, "beta");

    assert.equal(price?.amount, 42);
    assert.equal(price?.productId, 2);
    assert.equal(price?.updatedAt, "2026-09-20T03:00:00.000Z");
  });

  it("prend le prix de la carte pour la version de base", () => {
    assert.equal(pickMarketPrice([cardnexus, cardmarket], order)?.amount, 0.5);
  });

  it("retombe sur le prix de la carte pour une variante que personne ne cote", () => {
    assert.equal(pickMarketPrice([cardnexus, cardmarket], order, "fr")?.amount, 0.5);
  });

  it("préfère la variante cotée par un fournisseur moins bien placé au prix de sa carte", () => {
    assert.equal(pickMarketPrice([cardmarket, cardnexus], ["cardmarket", "cardnexus"], "beta")?.amount, 42);
  });

  it("n'emprunte pas le prix d'une variante pour la carte qui n'en a pas", () => {
    const betaOnly: PriceRecord = { ...cardnexus, prices: {}, offers: [] };

    assert.equal(pickMarketPrice([betaOnly], order), undefined);
    assert.equal(pickMarketPrice([betaOnly, cardmarket], order)?.amount, 0.8);
  });

  it("ne lit pas un fournisseur absent de l'ordre", () => {
    assert.equal(pickMarketPrice([cardnexus], ["cardmarket"], "beta"), undefined);
  });
});

describe("printingMarketPrice", () => {
  it("ne retombe pas sur le prix de la carte", () => {
    assert.equal(printingMarketPrice([cardnexus], ["cardnexus"], "beta")?.amount, 42);
    assert.equal(printingMarketPrice([cardnexus], ["cardnexus"], "fr"), undefined);
  });

  it("accepte une date déjà sérialisée", () => {
    const serialized = { ...cardnexus, sourceUpdatedAt: sourceUpdatedAt.toISOString() };
    assert.equal(printingMarketPrice([serialized], ["cardnexus"], "beta")?.updatedAt, "2026-09-20T03:00:00.000Z");
  });
});
