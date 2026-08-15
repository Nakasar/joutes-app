import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_EDITIONS,
  PRODUCT_EDITION_ATTRIBUTE,
  PRODUCT_EDITION_FIELD,
  editionFilter,
  editionOf,
  resolveEdition,
} from "@/lib/constants/product-editions";
import { cardAttributeKeySchema } from "@/lib/schemas/card.schema";

describe("product editions", () => {
  it("uses an attribute key the product form accepts", () => {
    // L'édition se saisit depuis `/admin/products` comme n'importe quel
    // attribut : une clé accentuée y serait refusée à l'enregistrement.
    assert.equal(cardAttributeKeySchema.safeParse(PRODUCT_EDITION_ATTRIBUTE).success, true);
    assert.equal(PRODUCT_EDITION_FIELD, `attributes.${PRODUCT_EDITION_ATTRIBUTE}`);
  });

  describe("resolveEdition", () => {
    it("falls back to the game's current edition", () => {
      assert.equal(resolveEdition(undefined, "Seconde édition"), "Seconde édition");
    });

    it("lets the caller ask for another edition", () => {
      assert.equal(resolveEdition("Première édition", "Seconde édition"), "Première édition");
    });

    it("lets the caller lift the restriction", () => {
      assert.equal(resolveEdition(ALL_EDITIONS, "Seconde édition"), undefined);
    });

    it("filters nothing for a game without editions", () => {
      assert.equal(resolveEdition(undefined, undefined), undefined);
      // Le champ retiré du document remonte parfois en chaîne vide côté client :
      // elle ne doit pas se confondre avec une édition nommée « ».
      assert.equal(resolveEdition(undefined, ""), undefined);
    });
  });

  describe("editionFilter", () => {
    it("matches the attribute of the requested edition", () => {
      assert.deepEqual(editionFilter("Seconde édition"), {
        [PRODUCT_EDITION_FIELD]: "Seconde édition",
      });
    });

    it("adds no condition when no edition is asked for", () => {
      assert.deepEqual(editionFilter(undefined), {});
      assert.deepEqual(editionFilter(ALL_EDITIONS), {});
    });

    it("leaves untagged products out of every edition", () => {
      // C'est ce qui donne son sens au réglage : « dernière édition » ne peut
      // pas vouloir dire « dernière édition, plus tout ce qu'on n'a pas trié ».
      const filter = editionFilter("Seconde édition") as Record<string, unknown>;
      assert.equal(Object.keys(filter).length, 1);
      assert.equal(filter[PRODUCT_EDITION_FIELD], "Seconde édition");
    });
  });

  describe("editionOf", () => {
    it("reads the edition a product carries", () => {
      assert.equal(editionOf({ edition: "Première édition", faction: "Empire" }), "Première édition");
    });

    it("ignores what cannot be an edition", () => {
      assert.equal(editionOf(undefined), undefined);
      assert.equal(editionOf({}), undefined);
      assert.equal(editionOf({ edition: "" }), undefined);
      assert.equal(editionOf({ edition: 2 }), undefined);
      assert.equal(editionOf({ edition: ["a", "b"] }), undefined);
    });
  });
});
