import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCardmarketDate } from "./cardmarket";

/**
 * Lecture des dates des fichiers Cardmarket, qui datent les relevés écrits en
 * base.
 *
 * Exécution : `npm run test`.
 */

describe("parseCardmarketDate", () => {
  it("lit le décalage horaire écrit sans deux-points", () => {
    assert.equal(parseCardmarketDate("2026-08-14T02:43:53+0200").toISOString(), "2026-08-14T00:43:53.000Z");
  });

  it("lit aussi une date déjà normalisée", () => {
    assert.equal(parseCardmarketDate("2026-08-14T02:43:53+02:00").toISOString(), "2026-08-14T00:43:53.000Z");
    assert.equal(parseCardmarketDate("2026-08-14T00:43:53Z").toISOString(), "2026-08-14T00:43:53.000Z");
  });

  it("refuse une date illisible plutôt que de la propager", () => {
    assert.throws(() => parseCardmarketDate("pas une date"), /illisible/);
  });
});
