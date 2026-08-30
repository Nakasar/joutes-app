import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatWishlistLine, formatWishlistText } from "./export";

/**
 * Écriture d'une liste de souhaits au format texte.
 *
 * Exécution : `npm run test`.
 */

describe("formatWishlistLine", () => {
  it("écrit le nom, le numéro de collection puis l'extension", () => {
    assert.equal(
      formatWishlistLine({
        name: "Elzar Mann, Hanté Par Une Vision",
        setCode: "ASH",
        collectorNumber: "829",
      }),
      "Elzar Mann, Hanté Par Une Vision 829 (ASH)"
    );
  });

  it("tait la quantité d'un exemplaire unique", () => {
    assert.equal(
      formatWishlistLine({ name: "Grogu", setCode: "ASH", collectorNumber: "12", quantity: 1 }),
      "Grogu 12 (ASH)"
    );
  });

  it("ouvre la ligne sur la quantité dès qu'il en faut plusieurs", () => {
    assert.equal(
      formatWishlistLine({ name: "Grogu", setCode: "ASH", collectorNumber: "12", quantity: 3 }),
      "3x Grogu 12 (ASH)"
    );
  });

  it("laisse la carte sans ses références plutôt que des parenthèses vides", () => {
    assert.equal(formatWishlistLine({ name: "Purrgil Ultra" }), "Purrgil Ultra");
    assert.equal(formatWishlistLine({ name: "Purrgil Ultra", setCode: "ASH" }), "Purrgil Ultra (ASH)");
    assert.equal(formatWishlistLine({ name: "Purrgil Ultra", collectorNumber: "7" }), "Purrgil Ultra 7");
  });

  it("ne laisse pas traîner les blancs d'une saisie", () => {
    assert.equal(
      formatWishlistLine({ name: "  Grogu  ", setCode: " ASH ", collectorNumber: " 12 ", quantity: 2 }),
      "2x Grogu 12 (ASH)"
    );
  });

  it("ne prend pas une référence vide pour une référence", () => {
    assert.equal(formatWishlistLine({ name: "Grogu", setCode: "", collectorNumber: "" }), "Grogu");
  });
});

describe("formatWishlistText", () => {
  it("rend une carte par ligne, dans l'ordre reçu", () => {
    assert.equal(
      formatWishlistText([
        { name: "Grogu", setCode: "ASH", collectorNumber: "12" },
        { name: "Purrgil Ultra", setCode: "ASH", collectorNumber: "7", quantity: 2 },
      ]),
      "Grogu 12 (ASH)\n2x Purrgil Ultra 7 (ASH)"
    );
  });

  it("ne rend rien d'une liste vide", () => {
    assert.equal(formatWishlistText([]), "");
  });
});
