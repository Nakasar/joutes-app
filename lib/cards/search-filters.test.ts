import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFacetFilters,
  buildSortExpressions,
  countActiveFacetFilters,
  EMPTY_CRITERIA,
  parseCardSearchCriteria,
  serializeCardSearchCriteria,
  sortableKeys,
  withRangeBound,
  withToggledValue,
  withoutFacetFilters,
  withoutRange,
  type CardFilterFacet,
} from "./search-filters";

/**
 * Filtres et tri de l'exploration des cartes. Ce qui est vérifié ici avant
 * tout : rien de ce que l'appelant envoie n'atterrit tel quel dans une
 * expression de filtre Meilisearch.
 *
 * Exécution : `npm run test`.
 */

const facets: CardFilterFacet[] = [
  { key: "energy", type: "number", min: 0, max: 9 },
  { key: "might", type: "number", min: 0, max: 12 },
  { key: "domain", type: "value", values: ["Fury", "Calm", "Mind"] },
  { key: "rarity", type: "value", values: ["Common", "Rare"] },
];

const params = (search: string) => new URLSearchParams(search);

describe("parseCardSearchCriteria", () => {
  it("lit les plages et les listes de valeurs", () => {
    const criteria = parseCardSearchCriteria(
      params("min_energy=2&max_energy=5&in_domain=Fury,Calm&in_rarity=Rare"),
      facets
    );

    assert.deepEqual(criteria.ranges, { energy: { min: 2, max: 5 } });
    assert.deepEqual(criteria.values, { domain: ["Fury", "Calm"], rarity: ["Rare"] });
  });

  it("accepte une plage ouverte d'un seul côté", () => {
    assert.deepEqual(parseCardSearchCriteria(params("min_might=3"), facets).ranges, { might: { min: 3 } });
    assert.deepEqual(parseCardSearchCriteria(params("max_might=3"), facets).ranges, { might: { max: 3 } });
  });

  it("ignore un attribut que le jeu ne porte pas", () => {
    // Sans quoi on filtrerait sur un champ inexistant, voire injecté.
    const criteria = parseCardSearchCriteria(params("min_inconnu=2&in_inconnu=x"), facets);

    assert.deepEqual(criteria.ranges, {});
    assert.deepEqual(criteria.values, {});
  });

  it("ignore une borne qui n'est pas un nombre", () => {
    const criteria = parseCardSearchCriteria(params("min_energy=abc&max_energy=&min_might=1"), facets);

    assert.deepEqual(criteria.ranges, { might: { min: 1 } });
  });

  it("ignore une valeur absente de la facette", () => {
    const criteria = parseCardSearchCriteria(params('in_domain=Fury,Inventée,"injection"'), facets);

    assert.deepEqual(criteria.values, { domain: ["Fury"] });
  });

  it("remet une plage inversée dans l'ordre", () => {
    // Min supérieur au max ne renverrait rien, sans dire pourquoi.
    const criteria = parseCardSearchCriteria(params("min_energy=7&max_energy=2"), facets);

    assert.deepEqual(criteria.ranges, { energy: { min: 2, max: 7 } });
  });

  it("ne retient pas deux fois la même valeur", () => {
    const criteria = parseCardSearchCriteria(params("in_domain=Fury,Fury"), facets);

    assert.deepEqual(criteria.values, { domain: ["Fury"] });
  });

  it("lit un tri connu et écarte les autres", () => {
    assert.deepEqual(parseCardSearchCriteria(params("sort=energy:desc"), facets).sort, {
      key: "energy",
      direction: "desc",
    });
    assert.deepEqual(parseCardSearchCriteria(params("sort=name"), facets).sort, {
      key: "name",
      direction: "asc",
    });
    // Un attribut de valeurs ne se trie pas, et une direction inventée non plus.
    assert.equal(parseCardSearchCriteria(params("sort=domain:asc"), facets).sort, undefined);
    assert.equal(parseCardSearchCriteria(params("sort=energy:haut"), facets).sort, undefined);
    assert.equal(parseCardSearchCriteria(params("sort=inconnu:asc"), facets).sort, undefined);
  });
});

describe("sortableKeys", () => {
  it("propose les champs communs et les attributs numériques", () => {
    assert.deepEqual(sortableKeys(facets), ["name", "collectorNumber", "energy", "might"]);
  });
});

describe("buildFacetFilters", () => {
  it("écrit les plages et les listes", () => {
    const criteria = parseCardSearchCriteria(
      params("min_energy=2&max_energy=5&in_domain=Fury,Calm"),
      facets
    );

    assert.deepEqual(buildFacetFilters(criteria, facets), [
      "energy >= 2",
      "energy <= 5",
      'domain IN ["Fury", "Calm"]',
    ]);
  });

  it("échappe les guillemets et les antislashs d'une valeur", () => {
    // Une valeur du catalogue peut en contenir : elle ne doit pas refermer la
    // chaîne et transformer la suite en expression.
    const piegees: CardFilterFacet[] = [
      { key: "illustrator", type: "value", values: ['Say "Hi"', "A\\B"] },
    ];
    const criteria = parseCardSearchCriteria(params('in_illustrator=Say "Hi",A\\B'), piegees);

    assert.deepEqual(buildFacetFilters(criteria, piegees), [
      'illustrator IN ["Say \\"Hi\\"", "A\\\\B"]',
    ]);
  });

  it("ne produit rien sans critère", () => {
    assert.deepEqual(buildFacetFilters(parseCardSearchCriteria(params(""), facets), facets), []);
  });
});

describe("buildSortExpressions", () => {
  it("écrit le tri demandé", () => {
    const criteria = parseCardSearchCriteria(params("sort=energy:desc"), facets);

    assert.deepEqual(buildSortExpressions(criteria, { collectorNumber: "collectorNumber" }), [
      "energy:desc",
    ]);
  });

  it("traduit le numéro de collection vers le champ de l'index", () => {
    // Chez Magic, l'index l'appelle `collector_number`.
    const criteria = parseCardSearchCriteria(params("sort=collectorNumber:asc"), facets);

    assert.deepEqual(buildSortExpressions(criteria, { collectorNumber: "collector_number" }), [
      "collector_number:asc",
    ]);
  });

  it("ne trie pas sans consigne", () => {
    assert.deepEqual(
      buildSortExpressions(parseCardSearchCriteria(params(""), facets), { collectorNumber: "cn" }),
      []
    );
  });
});

describe("serializeCardSearchCriteria", () => {
  it("fait l'aller-retour avec la lecture", () => {
    const source = params("min_energy=2&max_energy=5&in_domain=Fury,Calm&sort=might:desc");
    const criteria = parseCardSearchCriteria(source, facets);
    const rebuilt = parseCardSearchCriteria(
      new URLSearchParams(serializeCardSearchCriteria(criteria)),
      facets
    );

    assert.deepEqual(rebuilt, criteria);
  });
});

describe("countActiveFacetFilters", () => {
  it("compte les attributs filtrés, pas les bornes", () => {
    const criteria = parseCardSearchCriteria(
      params("min_energy=2&max_energy=5&in_domain=Fury,Calm"),
      facets
    );

    assert.equal(countActiveFacetFilters(criteria), 2);
    assert.equal(countActiveFacetFilters(parseCardSearchCriteria(params("sort=name"), facets)), 0);
  });
});

describe("withRangeBound", () => {
  it("pose une borne sans toucher à l'autre", () => {
    const withMin = withRangeBound(EMPTY_CRITERIA, "energy", "min", "2");
    const both = withRangeBound(withMin, "energy", "max", "5");

    assert.deepEqual(both.ranges, { energy: { min: 2, max: 5 } });
  });

  it("retire la borne qu'on vide, et l'attribut qui n'en a plus", () => {
    const both = withRangeBound(withRangeBound(EMPTY_CRITERIA, "energy", "min", "2"), "energy", "max", "5");

    assert.deepEqual(withRangeBound(both, "energy", "max", "").ranges, { energy: { min: 2 } });
    assert.deepEqual(withRangeBound(withRangeBound(both, "energy", "max", ""), "energy", "min", "").ranges, {});
  });

  it("ignore une saisie qui n'est pas un nombre", () => {
    const criteria = withRangeBound(EMPTY_CRITERIA, "energy", "min", "beaucoup");

    assert.deepEqual(criteria.ranges, {});
  });

  it("ne modifie pas les critères reçus", () => {
    const before = withRangeBound(EMPTY_CRITERIA, "energy", "min", "2");
    withRangeBound(before, "energy", "max", "5");

    assert.deepEqual(before.ranges, { energy: { min: 2 } });
  });
});

describe("withToggledValue", () => {
  it("coche puis décoche, et laisse l'attribut vide de côté", () => {
    const one = withToggledValue(EMPTY_CRITERIA, "domain", "Fury");
    const two = withToggledValue(one, "domain", "Calm");

    assert.deepEqual(two.values, { domain: ["Fury", "Calm"] });
    assert.deepEqual(withToggledValue(two, "domain", "Fury").values, { domain: ["Calm"] });
    assert.deepEqual(withToggledValue(one, "domain", "Fury").values, {});
  });
});

describe("withoutRange et withoutFacetFilters", () => {
  it("retire un attribut numérique, bornes comprises", () => {
    const criteria = parseCardSearchCriteria(params("min_energy=2&max_energy=5&in_domain=Fury"), facets);

    assert.deepEqual(withoutRange(criteria, "energy").ranges, {});
    assert.deepEqual(withoutRange(criteria, "energy").values, { domain: ["Fury"] });
  });

  it("vide les filtres mais garde le tri, qui n'en est pas un", () => {
    const criteria = parseCardSearchCriteria(params("min_energy=2&in_domain=Fury&sort=might:desc"), facets);
    const cleared = withoutFacetFilters(criteria);

    assert.equal(countActiveFacetFilters(cleared), 0);
    assert.deepEqual(cleared.sort, { key: "might", direction: "desc" });
  });
});
