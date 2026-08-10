import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boxCompletion,
  contentCompletion,
  productOwnership,
  suggestsRedundantPurchase,
} from "./product-ownership";

/**
 * Tests des indicateurs de possession d'un produit. Le cas qui justifie tout le
 * reste : posséder tout le contenu d'une boîte **sans** posséder la boîte.
 *
 * Exécution : `npm run test`.
 */

const spearhead = {
  id: "spearhead",
  contents: [
    { productId: "liberator", quantity: 3 },
    { productId: "annihilator", quantity: 2 },
  ],
};

describe("contentCompletion", () => {
  it("compte les références possédées, pas les exemplaires", () => {
    const completion = contentCompletion(spearhead.contents, { liberator: 3, annihilator: 2 });

    assert.deepEqual(completion, { owned: 2, total: 2, complete: true });
  });

  it("exige la quantité requise pour compter une référence", () => {
    const completion = contentCompletion(spearhead.contents, { liberator: 2, annihilator: 2 });

    assert.deepEqual(completion, { owned: 1, total: 2, complete: false });
  });

  it("compte une référence dès que la quantité est dépassée", () => {
    const completion = contentCompletion(spearhead.contents, { liberator: 10, annihilator: 2 });

    assert.equal(completion.complete, true);
  });

  it("ne rend rien de complet sans contenu", () => {
    // Une figurine n'a pas de contenu : la marquer « complète » allumerait
    // l'indicateur sur tout le catalogue.
    assert.deepEqual(contentCompletion(undefined, { liberator: 3 }), {
      owned: 0,
      total: 0,
      complete: false,
    });
    assert.deepEqual(contentCompletion([], {}), { owned: 0, total: 0, complete: false });
  });

  it("ne compte rien avec une collection vide", () => {
    assert.deepEqual(contentCompletion(spearhead.contents, {}), {
      owned: 0,
      total: 2,
      complete: false,
    });
  });
});

describe("boxCompletion", () => {
  it("ne compte que ce qui est encore rattaché à cet exemplaire", () => {
    // Deux figurines sont sorties de la boîte : elle n'est plus complète, même
    // si la collection en contient d'autres par ailleurs.
    const completion = boxCompletion(spearhead.contents, { liberator: 1, annihilator: 2 });

    assert.deepEqual(completion, { owned: 1, total: 2, complete: false });
  });

  it("est complète tant que rien n'en est sorti", () => {
    assert.equal(boxCompletion(spearhead.contents, { liberator: 3, annihilator: 2 }).complete, true);
  });
});

describe("productOwnership", () => {
  it("rend les exemplaires du produit et la complétude de son contenu", () => {
    const ownership = productOwnership(spearhead, { spearhead: 1, liberator: 3, annihilator: 2 });

    assert.deepEqual(ownership, { copies: 1, owned: 2, total: 2, complete: true });
  });

  it("rend zéro exemplaire pour un produit absent de la collection", () => {
    assert.equal(productOwnership(spearhead, {}).copies, 0);
  });
});

describe("suggestsRedundantPurchase", () => {
  it("s'allume quand tout le contenu est possédé mais pas la boîte", () => {
    const ownership = productOwnership(spearhead, { liberator: 3, annihilator: 2 });

    assert.equal(suggestsRedundantPurchase(ownership), true);
  });

  it("reste éteint sur une boîte déjà possédée", () => {
    const ownership = productOwnership(spearhead, { spearhead: 1, liberator: 3, annihilator: 2 });

    assert.equal(suggestsRedundantPurchase(ownership), false);
  });

  it("reste éteint sur un contenu incomplet", () => {
    const ownership = productOwnership(spearhead, { liberator: 3 });

    assert.equal(suggestsRedundantPurchase(ownership), false);
  });

  it("reste éteint sur une figurine, qui n'a pas de contenu", () => {
    const ownership = productOwnership({ id: "liberator" }, {});

    assert.equal(suggestsRedundantPurchase(ownership), false);
  });
});
