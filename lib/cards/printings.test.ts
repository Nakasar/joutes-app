import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changePrinting, editionPrinting, isFoilForced, printingEdition, resolvePrinting } from "./printings";

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

describe("changePrinting", () => {
  it("passe un exemplaire de base dans une variante existante", () => {
    assert.deepEqual(changePrinting(card, {}, "promo-judge"), {
      printingId: "promo-judge",
      printingName: "Promo Judge",
      foil: false,
      image: "judge.png",
    });
  });

  it("renvoie null quand la carte n'existe pas dans la variante", () => {
    assert.equal(changePrinting(card, {}, "beta"), null);
    assert.equal(changePrinting({ image: "x.png" }, {}, "beta"), null);
  });

  it("conserve le foil choisi à la main", () => {
    assert.equal(changePrinting(card, { foil: true }, "promo-judge")?.foil, true);
    assert.equal(changePrinting(card, { foil: true, printingId: "promo-judge" })?.foil, true);
  });

  it("retire le foil qui ne tenait qu'à l'ancienne variante", () => {
    assert.deepEqual(changePrinting(card, { foil: true, printingId: "foil" }), { foil: false, image: "base.png" });
  });

  it("impose le foil d'une variante foil", () => {
    assert.equal(changePrinting(card, {}, "foil")?.foil, true);
  });
});

describe("printingEdition", () => {
  it("rassemble les variantes d'une même édition, chacune avec son numéro", () => {
    const chromeFang = printingEdition({ name: "Welcome to Night City — Beta (β008)" });
    const rebootOptics = printingEdition({ name: "Welcome to Night City — Beta (β136)" });

    assert.equal(chromeFang.key, rebootOptics.key);
    assert.equal(chromeFang.name, "Welcome to Night City — Beta");
    assert.notEqual(chromeFang.key, printingEdition({ name: "Welcome to Night City — Retail (136)" }).key);
  });

  it("préfère l'extension propre à la variante quand elle est connue", () => {
    assert.equal(
      printingEdition({ name: "Welcome to Night City — Beta (β008)", setCode: "WNCB" }).key,
      printingEdition({ name: "Autre libellé (β136)", setCode: "wncb" }).key
    );
  });

  it("garde entier un nom sans numéro", () => {
    assert.equal(printingEdition({ name: "Promo Judge" }).name, "Promo Judge");
    assert.equal(printingEdition({ name: "Foil (Showcase)" }).name, "Foil (Showcase)");
  });
});

describe("editionPrinting", () => {
  const beta = printingEdition({ name: "Welcome to Night City — Beta (β005a)" }).key;

  it("trouve la variante de la carte dans l'édition", () => {
    const card = {
      collectorNumber: "008",
      printings: [
        { id: "retail-fr", name: "Welcome to Night City — Retail — FR (008)" },
        { id: "beta-uuid", name: "Welcome to Night City — Beta (β008)" },
      ],
    };

    assert.equal(editionPrinting(card, beta)?.id, "beta-uuid");
    assert.equal(editionPrinting({ collectorNumber: "001", printings: [] }, beta), undefined);
  });

  it("choisit, entre deux tirages d'une même édition, celui qui porte le numéro de la carte", () => {
    const card = {
      collectorNumber: "005a",
      printings: [
        { id: "b", name: "Welcome to Night City — Beta (β005b)" },
        { id: "a", name: "Welcome to Night City — Beta (β005a)" },
        { id: "c", name: "Welcome to Night City — Beta (β144)" },
      ],
    };

    assert.equal(editionPrinting(card, beta)?.id, "a");
  });

  it("retombe sur le premier tirage quand aucun ne porte le numéro de la carte", () => {
    const card = {
      collectorNumber: "144",
      printings: [
        { id: "b", name: "Welcome to Night City — Beta (β005b)" },
        { id: "a", name: "Welcome to Night City — Beta (β005a)" },
      ],
    };

    assert.equal(editionPrinting(card, beta)?.id, "b");
  });
});
