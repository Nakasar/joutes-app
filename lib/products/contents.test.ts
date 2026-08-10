import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeContentIssue,
  flattenContents,
  isContainer,
  normalizeContents,
  validateContents,
  type ReferencedProduct,
} from "./contents";

/**
 * Tests de la composition d'un produit. Ce qui compte ici, c'est la règle du
 * niveau unique : tout le reste du code (ajout à la collection, retrait,
 * affichage) suppose qu'un contenu ne contient rien.
 *
 * Exécution : `npm run test`.
 */

const leaf = (id: string, name = id): ReferencedProduct => ({ id, name, hasContents: false });
const container = (id: string, name = id): ReferencedProduct => ({ id, name, hasContents: true });

describe("normalizeContents", () => {
  it("fusionne les doublons en additionnant les quantités", () => {
    const contents = normalizeContents([
      { productId: "liberator", quantity: 2 },
      { productId: "annihilator", quantity: 1 },
      { productId: "liberator", quantity: 3 },
    ]);

    assert.deepEqual(contents, [
      { productId: "liberator", quantity: 5 },
      { productId: "annihilator", quantity: 1 },
    ]);
  });

  it("conserve l'ordre de première apparition", () => {
    const contents = normalizeContents([
      { productId: "b", quantity: 1 },
      { productId: "a", quantity: 1 },
      { productId: "b", quantity: 1 },
    ]);

    assert.deepEqual(contents.map((line) => line.productId), ["b", "a"]);
  });

  it("écarte les identifiants vides et ramène les quantités dans les bornes", () => {
    const contents = normalizeContents([
      { productId: "  ", quantity: 4 },
      { productId: "liberator", quantity: 0 },
      { productId: "annihilator", quantity: 500 },
    ]);

    assert.deepEqual(contents, [
      { productId: "liberator", quantity: 1 },
      { productId: "annihilator", quantity: 99 },
    ]);
  });
});

describe("validateContents", () => {
  it("accepte un contenu de figurines", () => {
    const { issues } = validateContents(
      "spearhead",
      [
        { productId: "liberator", quantity: 3 },
        { productId: "annihilator", quantity: 2 },
      ],
      [leaf("liberator"), leaf("annihilator")]
    );

    assert.deepEqual(issues, []);
  });

  it("refuse qu'un produit se contienne lui-même", () => {
    const { issues } = validateContents("spearhead", [{ productId: "spearhead", quantity: 1 }], []);

    assert.deepEqual(issues, [{ code: "self-reference" }]);
  });

  it("refuse un contenant à l'intérieur d'un contenant", () => {
    const { issues } = validateContents(
      "battleforce",
      [{ productId: "spearhead", quantity: 1 }],
      [container("spearhead", "Spearhead: Stormstrike")]
    );

    assert.deepEqual(issues, [
      { code: "nested-container", productId: "spearhead", name: "Spearhead: Stormstrike" },
    ]);
  });

  it("signale une référence inconnue sans avaler les autres lignes", () => {
    const { contents, issues } = validateContents(
      "spearhead",
      [
        { productId: "liberator", quantity: 1 },
        { productId: "inexistant", quantity: 1 },
      ],
      [leaf("liberator")]
    );

    assert.deepEqual(issues, [{ code: "unknown", productId: "inexistant" }]);
    // La normalisation reste rendue en entier : c'est à l'appelant de refuser
    // l'enregistrement, pas à la validation de mutiler la saisie.
    assert.equal(contents.length, 2);
  });

  it("nomme le produit fautif dans le message", () => {
    const message = describeContentIssue({
      code: "nested-container",
      productId: "spearhead",
      name: "Spearhead: Stormstrike",
    });

    assert.match(message, /Spearhead: Stormstrike/);
  });
});

describe("isContainer", () => {
  it("ne dépend que du contenu", () => {
    assert.equal(isContainer({ contents: [{ productId: "liberator", quantity: 1 }] }), true);
    assert.equal(isContainer({ contents: [] }), false);
    assert.equal(isContainer({}), false);
  });
});

describe("flattenContents", () => {
  it("déplie chaque quantité en autant d'unités", () => {
    const units = flattenContents([
      { productId: "liberator", quantity: 3 },
      { productId: "annihilator", quantity: 1 },
    ]);

    assert.deepEqual(units, ["liberator", "liberator", "liberator", "annihilator"]);
  });

  it("ne rend rien pour un contenu vide", () => {
    assert.deepEqual(flattenContents([]), []);
  });
});
