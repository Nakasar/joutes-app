import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coverage, locKey, nextRuneUse, payAction, proposedChoice, sameLoc } from "./payment.ts";
import type { EnginePayment } from "./types.ts";

// Falling Star (2 d'Énergie, 2 Fureur) : runes 1 à 3 Fureur, 4 Calme ; un Seal of Rage (10) et un Or (11).
const payment: EnginePayment = {
  cost: { energy: 2, power: [{ Of: "fury" }, { Of: "fury" }] },
  domains: ["fury"],
  exhaust: [1, 2],
  recycle: [1, 2],
  runes: [1, 2, 3, 4],
  abilities: [
    { source: 10, ability: 0, energy: 0, power: [{ Of: "fury" }] },
    { source: 11, ability: 0, energy: 0, power: ["Any"] },
  ],
};
const domainOf = (id: number) => (id === 4 ? "calm" : "fury");
const empty = { energy: 0, power: [0, 0, 0, 0, 0, 0] };

describe("paiement personnalisé", () => {
  it("reprend la proposition du moteur", () => {
    const choice = proposedChoice(payment);
    assert.deepEqual(choice.runes, { 1: "both", 2: "both" });
    const cover = coverage(payment, empty, domainOf, choice);
    assert.equal(cover.ok, true);
    assert.deepEqual(cover.energy, { key: "energy", have: 2, need: 2 });
    assert.deepEqual(cover.power, [{ key: "fury", have: 2, need: 2 }]);
    assert.deepEqual(payAction(choice), { type: "pay", exhaust: [1, 2], recycle: [1, 2], abilities: [] });
  });

  it("paie la Fureur avec le Seal et l'Or au lieu de recycler", () => {
    const choice = { runes: { 3: "exhaust", 4: "exhaust" } as const, abilities: ["10:0", "11:0"] };
    const cover = coverage(payment, empty, domainOf, { ...choice, runes: { ...choice.runes } });
    assert.equal(cover.ok, true);
    assert.equal(cover.extraPower, 0);
    assert.deepEqual(payAction({ ...choice, runes: { ...choice.runes } }).abilities, [
      [10, 0],
      [11, 0],
    ]);
  });

  it("signale ce qui manque et ce qui serait perdu", () => {
    const short = coverage(payment, empty, domainOf, { runes: { 4: "both" }, abilities: [] });
    assert.equal(short.ok, false);
    assert.deepEqual(short.energy, { key: "energy", have: 1, need: 2 });
    // Une Puissance Calme ne paie pas la Fureur : elle resterait dans la réserve.
    assert.deepEqual(short.power, [{ key: "fury", have: 0, need: 2 }]);
    assert.equal(short.extraPower, 1);
    const extra = coverage(payment, empty, domainOf, {
      runes: { 1: "both", 2: "both", 3: "exhaust" },
      abilities: [],
    });
    assert.equal(extra.ok, true);
    assert.equal(extra.extraEnergy, 1);
  });

  it("compte la réserve déjà remplie et la Puissance de la carte", () => {
    const card: EnginePayment = { ...payment, cost: { energy: 1, power: ["Card"] }, abilities: [] };
    const cover = coverage(card, { energy: 1, power: [1, 0, 0, 0, 0, 0] }, domainOf, { runes: {}, abilities: [] });
    assert.equal(cover.ok, true);
    assert.deepEqual(cover.power, [{ key: "fury", have: 1, need: 1 }]);
  });

  it("fait tourner une rune entre ses usages", () => {
    assert.equal(nextRuneUse("none", false), "exhaust");
    assert.equal(nextRuneUse("exhaust", false), "both");
    assert.equal(nextRuneUse("both", false), "recycle");
    assert.equal(nextRuneUse("recycle", false), "none");
    // Déjà épuisée : on ne peut que la recycler.
    assert.equal(nextRuneUse("none", true), "recycle");
    assert.equal(nextRuneUse("recycle", true), "none");
  });

  it("compare les emplacements", () => {
    assert.equal(sameLoc({ Base: 0 }, { Base: 0 }), true);
    assert.equal(sameLoc({ Bf: 1 }, { Base: 1 }), false);
    assert.equal(locKey({ Bf: 1 }), "bf:1");
  });
});
