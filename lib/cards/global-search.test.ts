import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSearchFields } from "./search-syntax";
import type { CardFilterFacet } from "./search-filters";
import { cardSyntaxMatch, mayUseCardSyntax } from "./global-search";

const facets: CardFilterFacet[] = [
  { key: "energy", type: "number", min: 0, max: 12 },
  { key: "domain", type: "value", values: ["Fury", "Calm"] },
];
const fields = buildSearchFields(facets, { setCodes: ["OGN", "UNL"], types: ["Unit", "Spell"], languages: ["en"] });

describe("mayUseCardSyntax", () => {
  it("repère un token ou un numéro seul", () => {
    assert.equal(mayUseCardSyntax("set:UNL"), true);
    assert.equal(mayUseCardSyntax("energy<=3"), true);
    assert.equal(mayUseCardSyntax("12"), true);
    assert.equal(mayUseCardSyntax("Jinx"), false);
  });
});

describe("cardSyntaxMatch", () => {
  it("lit l'extension et le numéro comme l'éditeur de booster", () => {
    assert.deepEqual(cardSyntaxMatch("set:UNL 12", fields, facets), {
      $and: [{ setCode: "UNL" }, { collectorNumber: { $in: ["12", "012", "0012", 12] } }],
    });
    assert.deepEqual(cardSyntaxMatch("e:unl cn:012a", fields, facets), {
      $and: [{ setCode: "UNL" }, { collectorNumber: { $in: ["012a", "12a", "0012a"] } }],
    });
  });

  it("traduit les attributs du jeu, avec le nom en plus", () => {
    const match = cardSyntaxMatch("domain:fury energy<=3 Jinx", fields, facets) as { $and: Record<string, unknown>[] };
    assert.ok(match.$and.some((clause) => "$or" in clause), "le nom reste cherché");
    assert.ok(match.$and.some((clause) => JSON.stringify(clause) === JSON.stringify({ energy: { $lte: 3 } })));
    assert.ok(match.$and.some((clause) => JSON.stringify(clause) === JSON.stringify({ domain: { $in: ["Fury"] } })));
  });

  it("écarte le jeu qui ne connaît pas le filtre demandé", () => {
    assert.equal(cardSyntaxMatch("set:SFD 12", fields, facets), null);
    assert.equal(cardSyntaxMatch("e:SFD", fields, facets), null);
  });

  it("laisse une recherche par nom ordinaire au chemin habituel", () => {
    assert.equal(cardSyntaxMatch("Jinx", fields, facets), null);
    assert.equal(cardSyntaxMatch("might:3", fields, facets), null);
  });
});
