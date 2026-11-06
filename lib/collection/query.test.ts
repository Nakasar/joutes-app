import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CardFilterFacet } from "@/lib/cards/search-filters";
import { collectionSearchFields, parseCollectionQuery } from "@/lib/collection/query";

/**
 * La recherche de la collection lit la même syntaxe que la galerie : ces tests
 * vérifient ce qu'elle devient côté Mongo, et ce que la collection y ajoute.
 *
 * Exécution : `npm run test`.
 */

const FACETS: CardFilterFacet[] = [
  { key: "domain", type: "value", values: ["Calm", "Fury"] },
  { key: "energy", type: "number", min: 0, max: 12 },
];
const FIELDS = collectionSearchFields(FACETS, { setCodes: ["OGN", "SFD"], types: ["Unit", "Spell"], languages: ["en", "fr"] });
const query = (input: string) => parseCollectionQuery(input, FIELDS, FACETS);

describe("recherche de la collection", () => {
  it("garde un nom seul comme recherche de nom, sans filtre d'exemplaire", () => {
    const result = query("jinx");
    assert.ok("$or" in result.cardMatch);
    assert.equal(result.copyMatch, null);
    assert.equal(result.owned, undefined);
  });

  it("traduit les attributs du jeu et l'extension en filtres sur le catalogue", () => {
    const result = query("domain:fury energy<=3 set:ogn");
    assert.deepEqual(result.cardMatch, {
      $and: [{ setCode: "OGN" }, { energy: { $lte: 3 } }, { domain: { $in: ["Fury"] } }],
    });
    assert.equal(result.setCode, "OGN");
  });

  it("lit owned comme un nombre d'exemplaires possédés", () => {
    assert.deepEqual(query("owned<3").owned, { max: 2 });
    assert.deepEqual(query("owned=0").owned, { min: 0, max: 0 });
    assert.deepEqual(query("owned>=1").owned, { min: 1 });
  });

  it("filtre les exemplaires sur foil, état et langue, et ne garde alors que les cartes qu'on en possède", () => {
    const result = query("foil:yes cond:nm lang:fr");
    assert.deepEqual(result.copyMatch, {
      $and: [{ foil: true }, { condition: { $in: ["Near Mint"] } }, { language: "FR" }],
    });
    assert.deepEqual(result.owned, { min: 1 });
  });

  it("laisse owned décider quand il est écrit avec un filtre d'exemplaire", () => {
    assert.deepEqual(query("foil:yes owned=0").owned, { min: 0, max: 0 });
  });

  it("ne filtre rien quand foil:yes et foil:no sont demandés ensemble", () => {
    assert.equal(query("foil:yes foil:no").copyMatch, null);
  });

  it("cumule les filtres du panneau avec ceux de la saisie", () => {
    const result = parseCollectionQuery("domain:fury", FIELDS, FACETS, { ranges: { energy: { min: 2 } }, values: { domain: ["Calm"] } });
    assert.deepEqual(result.cardMatch, {
      $and: [{ energy: { $gte: 2 } }, { domain: { $in: ["Calm", "Fury"] } }],
    });
  });
});
