import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFoilForced, resolvePrinting } from "./printings";

/**
 * Résolution de la variante d'impression choisie par l'utilisateur : c'est
 * elle qui décide du caractère foil et de l'illustration enregistrés sur un
 * exemplaire (collection, booster, wishlist, liste de vente).
 *
 * Exécution : `npm run test`.
 */

const card = {
  image: "base.png",
  printings: [
    { id: "foil", name: "Foil", foil: true },
    { id: "promo-judge", name: "Promo Judge", image: "judge.png" },
  ],
};

describe("resolvePrinting", () => {
  it("retombe sur la version de base sans variante choisie", () => {
    assert.deepEqual(resolvePrinting(card), { foil: false, image: "base.png" });
  });

  it("impose le foil des variantes foil", () => {
    assert.deepEqual(resolvePrinting(card, "foil"), {
      printingId: "foil",
      printingName: "Foil",
      foil: true,
      image: "base.png",
    });
  });

  it("reprend l'illustration de la variante quand elle en a une", () => {
    assert.equal(resolvePrinting(card, "promo-judge").image, "judge.png");
  });

  it("retombe sur la version de base si la variante n'existe plus", () => {
    assert.deepEqual(resolvePrinting(card, "disparue"), { foil: false, image: "base.png" });
  });

  it("garde le foil de la carte sur une variante non foil", () => {
    const foilOnly = { ...card, foil: true };

    assert.equal(resolvePrinting(foilOnly, "promo-judge").foil, true);
  });
});

describe("isFoilForced", () => {
  it("verrouille le foil sur une carte qui n'existe qu'en foil", () => {
    assert.equal(isFoilForced({ foil: true }), true);
  });

  it("laisse le choix sur une carte et une variante ordinaires", () => {
    assert.equal(isFoilForced(card, "promo-judge"), false);
  });
});
