import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CardmarketPriceGuide, CardmarketProduct } from "./cardmarket";
import { buildCardPrice } from "./cardmarket-prices";

/**
 * Construction du relevé d'une carte à partir des produits Cardmarket qui lui
 * ont été rapprochés.
 *
 * Exécution : `npm run test`.
 */

const dates = { sourceUpdatedAt: new Date("2026-08-14T00:43:53Z"), updatedAt: new Date("2026-08-14T18:00:00Z") };

function product(idProduct: number, idExpansion = 4477, name = "Savage Swing (Red)"): CardmarketProduct {
  return {
    idProduct,
    name,
    idCategory: 1601,
    categoryName: "Flesh And Blood Single",
    idExpansion,
    idMetacard: 400000,
    dateAdded: "2021-12-31 00:00:00",
  };
}

function guide(idProduct: number, values: Partial<CardmarketPriceGuide>): CardmarketPriceGuide {
  return {
    idProduct,
    idCategory: 1601,
    avg: null,
    low: null,
    trend: null,
    avg1: null,
    avg7: null,
    avg30: null,
    "avg-foil": null,
    "low-foil": null,
    "trend-foil": null,
    "avg1-foil": null,
    "avg7-foil": null,
    "avg30-foil": null,
    ...values,
  };
}

describe("buildCardPrice", () => {
  it("reprend les valeurs du produit et les dates de la source", () => {
    const price = buildCardPrice(
      "WTR020",
      [product(600048)],
      new Map([[600048, guide(600048, { low: 0.77, avg: 1.1, trend: 0.9, avg1: 0.8, avg7: 0.85, avg30: 0.95 })]]),
      dates
    );

    assert.deepEqual(price?.prices, { low: 0.77, avg: 1.1, trend: 0.9, avg1: 0.8, avg7: 0.85, avg30: 0.95 });
    assert.equal(price?.currency, "EUR");
    assert.equal(price?.sourceUpdatedAt, dates.sourceUpdatedAt.toISOString());
    assert.equal(price?.updatedAt, dates.updatedAt.toISOString());
  });

  it("retient le tirage le moins cher comme prix de référence", () => {
    // Le foil et la première édition sont des produits distincts chez
    // Cardmarket, et toujours plus chers que le tirage de base.
    const price = buildCardPrice(
      "WTR020",
      [product(600048), product(600049), product(600599, 4479)],
      new Map([
        [600048, guide(600048, { trend: 15, low: 13.4 })],
        [600049, guide(600049, { trend: 0.9, low: 0.77 })],
        [600599, guide(600599, { trend: 0.21, low: 0.03 })],
      ]),
      dates
    );

    assert.equal(price?.prices.trend, 0.21);
    assert.deepEqual(price?.offers.map((offer) => offer.productId), [600048, 600049, 600599]);
  });

  it("classe un produit sans tendance après ceux qui en ont une", () => {
    const price = buildCardPrice(
      "WTR020",
      [product(600048), product(600049)],
      new Map([
        [600048, guide(600048, { low: 0.02 })],
        [600049, guide(600049, { trend: 0.9, low: 0.77 })],
      ]),
      dates
    );

    assert.equal(price?.prices.trend, 0.9);
  });

  it("ignore les valeurs absentes plutôt que de les écrire à zéro", () => {
    const price = buildCardPrice(
      "WTR020",
      [product(600048)],
      new Map([[600048, guide(600048, { low: 0.05, trend: 0, avg: null })]]),
      dates
    );

    assert.deepEqual(price?.prices, { low: 0.05 });
    assert.equal(price?.offers[0].foilPrices, undefined);
  });

  it("relève le foil quand Cardmarket le cote sur le même produit", () => {
    const price = buildCardPrice(
      "MST131",
      [product(551703)],
      new Map([[551703, guide(551703, { low: 1, trend: 1.2, "low-foil": 8, "trend-foil": 9.5 })]]),
      dates
    );

    assert.deepEqual(price?.offers[0].foilPrices, { low: 8, trend: 9.5 });
  });

  it("ne relève rien d'une carte qu'aucun produit ne cote", () => {
    const price = buildCardPrice("WTR020", [product(600048)], new Map([[600048, guide(600048, {})]]), dates);

    assert.equal(price, undefined);
  });

  it("ne relève rien d'un produit absent du guide des prix", () => {
    const price = buildCardPrice("WTR020", [product(600048)], new Map(), dates);

    assert.equal(price, undefined);
  });
});
