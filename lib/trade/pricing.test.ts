import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MarketPrice } from "@/lib/prices/display";
import { appliedUnitPrice, isNegotiatedPrice, sideTotal, tradeDifference } from "./pricing";

/**
 * Chiffrage d'un échange : prix appliqué à une carte, total d'une face et
 * écart entre les deux.
 *
 * Exécution : `npm run test`.
 */

const market = (amount: number, currency = "EUR"): MarketPrice => ({
  amount,
  currency,
  source: "cardmarket",
  updatedAt: "2026-08-14T00:43:53.000Z",
});

describe("appliedUnitPrice", () => {
  it("retient le prix décidé par le propriétaire", () => {
    assert.equal(appliedUnitPrice({ quantity: 1, unitPrice: 5, marketPrice: market(2) }), 5);
  });

  it("retombe sur le prix de marché", () => {
    assert.equal(appliedUnitPrice({ quantity: 1, marketPrice: market(2) }), 2);
  });

  it("ne vaut rien quand la carte n'a ni l'un ni l'autre", () => {
    assert.equal(appliedUnitPrice({ quantity: 1 }), undefined);
  });
});

describe("isNegotiatedPrice", () => {
  it("reconnaît un prix qui s'écarte du marché", () => {
    assert.equal(isNegotiatedPrice({ quantity: 1, unitPrice: 5, marketPrice: market(2) }), true);
  });

  it("ne signale rien quand le prix saisi est celui du marché", () => {
    assert.equal(isNegotiatedPrice({ quantity: 1, unitPrice: 2, marketPrice: market(2) }), false);
    assert.equal(isNegotiatedPrice({ quantity: 1, marketPrice: market(2) }), false);
  });

  it("signale un prix posé sur une carte que le marché ne cote pas", () => {
    assert.equal(isNegotiatedPrice({ quantity: 1, unitPrice: 5 }), true);
  });
});

describe("sideTotal", () => {
  it("multiplie chaque prix par ses exemplaires", () => {
    const total = sideTotal([{ quantity: 3, marketPrice: market(1.5) }, { quantity: 1, unitPrice: 10 }], "EUR");

    assert.equal(total.amount, 14.5);
    assert.equal(total.pricedCopies, 4);
    assert.equal(total.unpricedCopies, 0);
  });

  it("laisse dehors les cartes sans prix, et les compte", () => {
    const total = sideTotal([{ quantity: 2, marketPrice: market(1) }, { quantity: 3 }], "EUR");

    assert.equal(total.amount, 2);
    assert.equal(total.pricedCopies, 2);
    assert.equal(total.unpricedCopies, 3);
  });

  it("n'annonce aucune devise tant qu'aucune carte n'est chiffrée", () => {
    assert.equal(sideTotal([{ quantity: 2 }], "EUR").currency, undefined);
    assert.equal(sideTotal([], "EUR").currency, undefined);
  });

  it("reprend la devise du marché, sinon celle par défaut", () => {
    assert.equal(sideTotal([{ quantity: 1, marketPrice: market(1, "USD") }], "EUR").currency, "USD");
    // Un prix décidé sur une carte que le marché ne cote pas : rien n'en dit la
    // devise, c'est celle de l'échange qui s'applique.
    assert.equal(sideTotal([{ quantity: 1, unitPrice: 4 }], "EUR").currency, "EUR");
  });

  it("arrondit la traînée de la virgule flottante", () => {
    assert.equal(sideTotal([{ quantity: 3, marketPrice: market(0.1) }], "EUR").amount, 0.3);
  });
});

describe("tradeDifference", () => {
  it("est positif quand on donne plus qu'on ne reçoit", () => {
    const mine = sideTotal([{ quantity: 1, marketPrice: market(12) }], "EUR");
    const theirs = sideTotal([{ quantity: 1, marketPrice: market(9.5) }], "EUR");

    assert.equal(tradeDifference(mine, theirs), 2.5);
    assert.equal(tradeDifference(theirs, mine), -2.5);
  });
});
