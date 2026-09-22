import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkImportCoverage } from "./import-guard";

/**
 * Le garde-fou qui empêche un import automatique d'écrire un rapprochement
 * effondré.
 *
 * Exécution : `npm run test`.
 */

const coverage = (priced: number, cards = 1000) => ({ cards, matched: priced, priced });

describe("checkImportCoverage", () => {
  it("laisse passer le premier import", () => {
    assert.deepEqual(checkImportCoverage(coverage(700), null), { ok: true });
  });

  it("refuse un import qui ne cote aucune carte, même le premier", () => {
    assert.equal(checkImportCoverage(coverage(0), null).ok, false);
    assert.equal(checkImportCoverage(coverage(0), coverage(700)).ok, false);
  });

  it("laisse passer une baisse jusqu'à 10 %", () => {
    assert.deepEqual(checkImportCoverage(coverage(900), coverage(1000)), { ok: true });
  });

  it("refuse une chute de plus de 10 %", () => {
    const verdict = checkImportCoverage(coverage(899), coverage(1000));
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok ? "" : verdict.reason, /899 cartes cotées contre 1000/);
  });

  it("compte les cartes cotées, pas la part du catalogue", () => {
    // Une extension ajoutée au catalogue, que la place de marché ne vend pas
    // encore : la part baisse, le nombre de cartes cotées non.
    assert.deepEqual(checkImportCoverage(coverage(1000, 1500), coverage(1000, 1100)), { ok: true });
  });

  it("laisse passer une hausse", () => {
    assert.deepEqual(checkImportCoverage(coverage(1200), coverage(1000)), { ok: true });
  });
});
