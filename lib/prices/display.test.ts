import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardPriceAmount, formatCardPrice, sumCardPrices, type CardMarketPrice } from "./display";

/**
 * Mise en forme des prix affichés : le montant qui représente une carte, la
 * somme d'un lot, et leur écriture dans la langue de l'utilisateur.
 *
 * Exécution : `npm run test`.
 */

const price = (amount: number, currency = "EUR"): CardMarketPrice => ({
  amount,
  currency,
  updatedAt: "2026-08-14T00:43:53.000Z",
});

describe("cardPriceAmount", () => {
  it("retient la tendance, le prix lissé par la place de marché", () => {
    assert.equal(cardPriceAmount({ low: 0.03, avg: 0.09, trend: 0.21 }), 0.21);
  });

  it("retombe sur le prix bas, puis sur la moyenne", () => {
    assert.equal(cardPriceAmount({ low: 0.03, avg: 0.09 }), 0.03);
    assert.equal(cardPriceAmount({ avg: 0.09 }), 0.09);
  });

  it("ne montre rien d'une carte sans valeur", () => {
    assert.equal(cardPriceAmount({}), undefined);
  });
});

describe("sumCardPrices", () => {
  it("additionne les cartes cotées et compte celles qui portent le total", () => {
    assert.deepEqual(sumCardPrices([price(1.5), undefined, price(2.25)]), {
      amount: 3.75,
      currency: "EUR",
      priced: 2,
    });
  });

  it("arrondit la traînée de la virgule flottante", () => {
    // 0,1 + 0,2 vaut 0,30000000000000004 en binaire.
    assert.equal(sumCardPrices([price(0.1), price(0.2)])?.amount, 0.3);
  });

  it("ne rend rien quand aucune carte n'est cotée", () => {
    assert.equal(sumCardPrices([undefined, undefined]), undefined);
  });

  it("ne mélange pas les devises : la plus répandue l'emporte", () => {
    assert.deepEqual(sumCardPrices([price(1, "EUR"), price(2, "EUR"), price(100, "USD")]), {
      amount: 3,
      currency: "EUR",
      priced: 2,
    });
  });
});

describe("formatCardPrice", () => {
  it("écrit le montant dans la langue demandée", () => {
    assert.match(formatCardPrice(price(1.29), "fr"), /1,29/);
    assert.match(formatCardPrice(price(1.29), "en"), /1\.29/);
  });

  it("nomme une devise inconnue par son code plutôt que d'échouer", () => {
    // Un code inconnu mais bien formé reste mis en forme par l'environnement…
    assert.match(formatCardPrice(price(1.29, "ZZZ"), "fr"), /1,29\s*ZZZ/);
    // …un code malformé, lui, ferait lever `Intl` et emporterait la page.
    assert.equal(formatCardPrice(price(1.29, "EU"), "fr"), "1.29 EU");
  });
});
