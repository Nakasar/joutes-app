import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CardnexusFinishPrices, CardnexusProduct } from "./cardnexus";
import { buildCardnexusPrice, cardnexusProductName, finishPriceValues } from "./cardnexus-prices";

/**
 * Construction du relevé d'une carte à partir des produits CardNexus qui lui
 * ont été rapprochés, et choix des valeurs retenues parmi celles du feed.
 *
 * Exécution : `npm run test`.
 */

const dates = { sourceUpdatedAt: new Date("2026-06-08T03:22:09Z"), updatedAt: new Date("2026-06-10T18:00:00Z") };

function product(id: number, overrides: Partial<CardnexusProduct> = {}): CardnexusProduct {
  return {
    id,
    productType: "card",
    name: "Ahri, Alluring",
    nameSlug: "ahri-alluring",
    slug: "origins-ahri-alluring",
    expansionId: 42,
    expansionSlug: "origins",
    printNumber: "027",
    variant: null,
    ...overrides,
  };
}

describe("finishPriceValues", () => {
  it("range les valeurs de Cardmarket dans les nôtres", () => {
    const values = finishPriceValues({
      cardmarket: { currency: "EUR", low: 38.9, mid: 44.5, high: 59.99, marketValue: 43.75 },
    });

    assert.deepEqual(values, { low: 38.9, avg: 44.5, trend: 43.75 });
  });

  it("laisse de côté TCGplayer, qui cote en dollars", () => {
    const values = finishPriceValues({ tcgplayer: { currency: "USD", low: 42.5, marketValue: 47.2 } });

    assert.equal(values, undefined);
  });

  it("retombe sur l'annonce la moins chère de CardNexus", () => {
    const values = finishPriceValues({ cardnexus: { low: { amount: 38.5, currency: "EUR" }, listingCount: 14 } });

    assert.deepEqual(values, { low: 38.5 });
  });

  it("préfère l'instantané Cardmarket aux annonces", () => {
    const values = finishPriceValues({
      cardmarket: { currency: "EUR", marketValue: 43.75 },
      cardnexus: { low: { amount: 38.5, currency: "EUR" } },
    });

    assert.deepEqual(values, { trend: 43.75 });
  });

  it("ne retient pas un montant nul : une carte ne vaut pas zéro euro", () => {
    const values = finishPriceValues({ cardmarket: { currency: "EUR", low: 0, marketValue: 0 } });

    assert.equal(values, undefined);
  });

  it("ignore une annonce dans une autre devise", () => {
    const values = finishPriceValues({ cardnexus: { low: { amount: 47, currency: "USD" } } });

    assert.equal(values, undefined);
  });
});

describe("cardnexusProductName", () => {
  it("écrit la variante entre parenthèses", () => {
    assert.equal(cardnexusProductName(product(1, { variant: "Showcase" })), "Ahri, Alluring (Showcase)");
  });

  it("laisse le nom seul quand le produit n'est pas une variante", () => {
    assert.equal(cardnexusProductName(product(1)), "Ahri, Alluring");
  });
});

describe("buildCardnexusPrice", () => {
  const finishes = (byFinish: Record<string, CardnexusFinishPrices>) => byFinish;

  it("donne une offre par tirage coté", () => {
    const price = buildCardnexusPrice(
      "OGN027",
      [product(1)],
      new Map([
        [
          1,
          finishes({
            Standard: { cardmarket: { currency: "EUR", low: 1, marketValue: 1.2 } },
            Foil: { cardmarket: { currency: "EUR", low: 8, marketValue: 9.5 } },
          }),
        ],
      ]),
      dates
    );

    assert.deepEqual(price?.offers.map((offer) => offer.finish), ["Foil", "Standard"]);
    assert.equal(price?.currency, "EUR");
    assert.equal(price?.source, "cardnexus");
  });

  it("retient le tirage le moins cher comme prix de référence", () => {
    const price = buildCardnexusPrice(
      "OGN027",
      [product(1)],
      new Map([
        [
          1,
          finishes({
            Foil: { cardmarket: { currency: "EUR", low: 8, marketValue: 9.5 } },
            Standard: { cardmarket: { currency: "EUR", low: 1, marketValue: 1.2 } },
          }),
        ],
      ]),
      dates
    );

    assert.deepEqual(price?.prices, { low: 1, trend: 1.2 });
  });

  it("réunit les tirages de plusieurs produits d'une même carte", () => {
    const price = buildCardnexusPrice(
      "OGN027",
      [product(1), product(2, { variant: "Showcase" })],
      new Map([
        [1, finishes({ Standard: { cardmarket: { currency: "EUR", marketValue: 2 } } })],
        [2, finishes({ Standard: { cardmarket: { currency: "EUR", marketValue: 12 } } })],
      ]),
      dates
    );

    assert.deepEqual(price?.offers.map((offer) => offer.productId), [1, 2]);
    assert.deepEqual(price?.prices, { trend: 2 });
  });

  it("date le relevé du contenu du feed", () => {
    const price = buildCardnexusPrice(
      "OGN027",
      [product(1)],
      new Map([[1, finishes({ Standard: { cardmarket: { currency: "EUR", marketValue: 2 } } })] as const]),
      dates
    );

    assert.equal(price?.sourceUpdatedAt, "2026-06-08T03:22:09.000Z");
    assert.equal(price?.updatedAt, "2026-06-10T18:00:00.000Z");
  });

  it("n'écrit pas de relevé pour une carte qu'aucun tirage ne cote en euros", () => {
    const price = buildCardnexusPrice(
      "OGN027",
      [product(1)],
      new Map([[1, finishes({ Standard: { tcgplayer: { currency: "USD", marketValue: 2 } } })] as const]),
      dates
    );

    assert.equal(price, undefined);
  });

  it("n'écrit pas de relevé pour une carte absente du feed des prix", () => {
    assert.equal(buildCardnexusPrice("OGN027", [product(1)], new Map(), dates), undefined);
  });
});
