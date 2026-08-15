import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildProductSearchFields,
  parseProductQuery,
  productFacetMatch,
  type ProductFacet,
} from "@/lib/products/search";
import { EMPTY_CRITERIA } from "@/lib/cards/search-filters";

const FACETS: ProductFacet[] = [
  { key: "faction", type: "value", values: ["Empire", "Rebelles"] },
  { key: "points", type: "number", min: 4, max: 20 },
];

describe("product search", () => {
  describe("buildProductSearchFields", () => {
    it("speaks the game's attributes, plus the range and the shape", () => {
      const fields = buildProductSearchFields(FACETS, { setCodes: ["LEG"] });
      const keys = fields.map((field) => field.key);

      assert.deepEqual(keys, ["faction", "points", "set", "kind"]);
      assert.equal(fields.find((field) => field.key === "set")?.values?.[0], "LEG");
      // Les formes de produit sont closes : elles peuplent le champ `kind` sans
      // qu'un écran ait à les lui passer.
      assert.ok((fields.find((field) => field.key === "kind")?.values ?? []).includes("box"));
    });

    it("gives a one-letter shortcut only when it designates a single field", () => {
      const fields = buildProductSearchFields(FACETS, { setCodes: [] });

      assert.equal(fields.find((field) => field.key === "faction")?.alias, "f");
      // `points` et rien d'autre en `p`, mais `set` partage son `s` avec…
      // personne ici : c'est `kind` qui n'a pas de rival non plus.
      assert.equal(fields.find((field) => field.key === "points")?.alias, "p");
    });
  });

  describe("parseProductQuery", () => {
    it("reads the tokens and leaves the rest as the searched name", () => {
      const query = parseProductQuery({
        search: 'faction:Rebelles points<=8 commando',
        facets: FACETS,
        setCodes: ["LEG"],
      });

      assert.equal(query.search, "commando");
      assert.deepEqual(query.criteria.values.faction, ["Rebelles"]);
      assert.deepEqual(query.criteria.ranges.points, { max: 8 });
    });

    it("lets a token override the matching dropdown", () => {
      const query = parseProductQuery({
        search: "set:LEG kind:box",
        setCode: "all",
        kind: "unit",
        facets: FACETS,
        setCodes: ["LEG", "SHP"],
      });

      assert.equal(query.setCode, "LEG");
      assert.equal(query.kind, "box");
    });

    it("keeps the sidebar's filters and adds the query's own", () => {
      const query = parseProductQuery({
        search: "faction:Empire",
        criteria: { ...EMPTY_CRITERIA, values: { faction: ["Rebelles"] } },
        facets: FACETS,
      });

      // Deux valeurs d'un même attribut s'entendent comme un « ou » : le token
      // élargit le filtre de la colonne, il ne le remplace pas.
      assert.deepEqual(query.criteria.values.faction, ["Rebelles", "Empire"]);
    });

    it("reports a value the game does not carry rather than filtering on it", () => {
      const query = parseProductQuery({ search: "faction:Ewoks", facets: FACETS });

      assert.deepEqual(query.criteria.values, {});
      assert.deepEqual(
        query.parsed.rejected.map((token) => token.reason),
        ["value"]
      );
    });

    it("renders an empty search as no search at all", () => {
      const query = parseProductQuery({ search: "   ", facets: FACETS });
      assert.equal(query.search, undefined);
    });
  });

  describe("productFacetMatch", () => {
    it("bounds a numeric attribute and lists the values of the others", () => {
      const match = productFacetMatch(
        { ranges: { points: { min: 5, max: 12 } }, values: { faction: ["Empire"] } },
        FACETS
      );

      assert.deepEqual(match, {
        "attributes.points": { $gte: 5, $lte: 12 },
        "attributes.faction": { $in: ["Empire"] },
      });
    });

    it("ignores what the game does not declare", () => {
      // Ni la clé inconnue, ni la valeur absente de la facette ne descendent
      // jusqu'à la requête : les critères d'un appel extérieur ne décident pas
      // de ce sur quoi on filtre.
      const match = productFacetMatch(
        {
          ranges: { $where: { min: 1 }, faction: { min: 1 } },
          values: { faction: ["Ewoks"], unknown: ["x"] },
        },
        FACETS
      );

      assert.deepEqual(match, {});
    });
  });
});
