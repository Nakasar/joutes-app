import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRICE_SOURCE_LABELS, marketProductUrl } from "./sources";
import { CARD_PRICE_SOURCES } from "@/lib/types/card-price";

/**
 * Le nom et le lien qui dépendent de la place de marché d'où vient un prix.
 *
 * Un lien construit pour l'une mène à une page inexistante chez l'autre : ce
 * sont deux catalogues, et deux jeux d'identifiants.
 *
 * Exécution : `npm run test`.
 */

describe("marketProductUrl", () => {
  it("renvoie chaque prix chez la place de marché qui l'a relevé", () => {
    assert.match(marketProductUrl("cardmarket", "riftbound", 812) ?? "", /^https:\/\/www\.cardmarket\.com\//);
    assert.match(marketProductUrl("cardnexus", "riftbound", 812) ?? "", /^https:\/\/cardnexus\.com\//);
  });

  it("porte l'identifiant du produit, seul repère commun aux deux catalogues", () => {
    assert.ok(marketProductUrl("cardmarket", "riftbound", 812)?.includes("812"));
    assert.ok(marketProductUrl("cardnexus", "riftbound", 812)?.includes("812"));
  });

  it("n'invente pas de lien pour un jeu que la place de marché ne connaît pas", () => {
    // Yu-Gi-Oh est vendu sur Cardmarket, absent du catalogue CardNexus.
    assert.equal(marketProductUrl("cardnexus", "yugioh", 812), undefined);
    assert.equal(marketProductUrl("cardmarket", "sorcery", 812), undefined);
  });

  it("n'invente pas de lien sans produit ni sans jeu", () => {
    assert.equal(marketProductUrl("cardnexus", "riftbound", undefined), undefined);
    assert.equal(marketProductUrl("cardnexus", undefined, 812), undefined);
  });
});

describe("PRICE_SOURCE_LABELS", () => {
  it("nomme chaque fournisseur : un prix ne se lit pas sans savoir qui le publie", () => {
    for (const source of CARD_PRICE_SOURCES) {
      assert.ok(PRICE_SOURCE_LABELS[source]);
    }
  });
});
