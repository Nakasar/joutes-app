import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sumOwnedCardPrices, totalCollectionValue, type CollectionValue } from "@/lib/collection/value";
import type { MarketPrice } from "@/lib/prices/display";

/**
 * Tests de la valeur d'une collection. Le chiffre est montré comme un total
 * en euros : une erreur d'addition ne se voit pas, elle se croit.
 *
 * Exécution : `npm run test`.
 */

const COMPUTED_AT = new Date("2026-08-15T10:00:00.000Z");

function price(amount: number, currency = "EUR"): MarketPrice {
  return { amount, currency, source: "cardmarket", updatedAt: "2026-08-14T00:00:00.000Z" };
}

function value(overrides: Partial<CollectionValue> = {}): CollectionValue {
  return {
    amount: 10,
    currency: "EUR",
    copies: 5,
    pricedCopies: 5,
    computedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("sumOwnedCardPrices", () => {
  it("compte chaque exemplaire, pas chaque carte", async () => {
    const result = sumOwnedCardPrices(
      [
        { copies: 3, price: price(1.5) },
        { copies: 1, price: price(10) },
      ],
      COMPUTED_AT
    );

    assert.equal(result.amount, 14.5);
    assert.equal(result.copies, 4);
    assert.equal(result.pricedCopies, 4);
    assert.equal(result.currency, "EUR");
    assert.equal(result.computedAt, COMPUTED_AT.toISOString());
  });

  it("laisse hors du total les cartes sans relevé, et le dit", async () => {
    // Une carte sans prix ne vaut pas zéro : on ignore ce qu'elle vaut. Sans
    // `pricedCopies`, un total porté par deux cartes sur cent se lirait comme
    // le prix de la collection.
    const result = sumOwnedCardPrices(
      [
        { copies: 2, price: price(4) },
        { copies: 98 },
      ],
      COMPUTED_AT
    );

    assert.equal(result.amount, 8);
    assert.equal(result.copies, 100);
    assert.equal(result.pricedCopies, 2);
  });

  it("arrondit les traînées de la virgule flottante", async () => {
    const result = sumOwnedCardPrices(
      [
        { copies: 1, price: price(0.1) },
        { copies: 1, price: price(0.2) },
      ],
      COMPUTED_AT
    );

    assert.equal(result.amount, 0.3);
  });

  it("ne retient qu'une devise, la plus répandue", async () => {
    const result = sumOwnedCardPrices(
      [
        { copies: 3, price: price(2, "EUR") },
        { copies: 1, price: price(100, "USD") },
      ],
      COMPUTED_AT
    );

    assert.equal(result.currency, "EUR");
    assert.equal(result.amount, 6);
    assert.equal(result.pricedCopies, 3);
    assert.equal(result.copies, 4);
  });

  it("rend une valeur nulle et non une absence quand rien n'est coté", async () => {
    // Le calcul a bien eu lieu : c'est ce que la date atteste. Ne rien rendre
    // ferait passer une collection sans prix pour une collection jamais
    // estimée.
    const result = sumOwnedCardPrices([{ copies: 7 }], COMPUTED_AT);

    assert.deepEqual(result, {
      amount: 0,
      currency: "EUR",
      copies: 7,
      pricedCopies: 0,
      computedAt: COMPUTED_AT.toISOString(),
    });
  });

  it("tient le cas d'une collection vide", async () => {
    const result = sumOwnedCardPrices([], COMPUTED_AT);

    assert.equal(result.amount, 0);
    assert.equal(result.copies, 0);
    assert.equal(result.pricedCopies, 0);
  });
});

describe("totalCollectionValue", () => {
  it("additionne les jeux et compte ceux qui pèsent", async () => {
    const total = totalCollectionValue([
      value({ amount: 12.5, copies: 10, pricedCopies: 8 }),
      value({ amount: 7.25, copies: 4, pricedCopies: 4 }),
    ]);

    assert.equal(total?.amount, 19.75);
    assert.equal(total?.copies, 14);
    assert.equal(total?.pricedCopies, 12);
    assert.equal(total?.games, 2);
  });

  it("date le total du plus ancien de ses calculs", async () => {
    // Un jeu recalculé seul ne rajeunit pas le reste : le total est aussi
    // vieux que le plus vieux des chiffres qui le composent.
    const total = totalCollectionValue([
      value({ computedAt: "2026-08-15T10:00:00.000Z" }),
      value({ computedAt: "2026-06-01T09:00:00.000Z" }),
      value({ computedAt: "2026-07-20T18:00:00.000Z" }),
    ]);

    assert.equal(total?.computedAt, "2026-06-01T09:00:00.000Z");
  });

  it("n'existe pas tant qu'aucun jeu n'a été estimé", async () => {
    assert.equal(totalCollectionValue([]), undefined);
  });

  it("écarte les devises minoritaires plutôt que de les additionner", async () => {
    const total = totalCollectionValue([
      value({ amount: 10, currency: "EUR", pricedCopies: 9 }),
      value({ amount: 999, currency: "USD", pricedCopies: 1 }),
    ]);

    assert.equal(total?.currency, "EUR");
    assert.equal(total?.amount, 10);
    assert.equal(total?.games, 1);
  });
});
