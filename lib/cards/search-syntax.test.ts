import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyTokenSuggestion,
  buildSearchFields,
  currentWord,
  mergeSearchCriteria,
  parseSearchSyntax,
  removeSearchWord,
  splitSearchWords,
  suggestTokens,
} from "./search-syntax";
import type { CardFilterFacet } from "./search-filters";

/**
 * Ce qui compte ici : le vocabulaire vient du catalogue du jeu, et un mot qui
 * n'est pas un token reconnu reste du texte libre — taper un nom de carte ne
 * doit jamais devenir une erreur de syntaxe.
 *
 * Exécution : `npm run test`.
 */

const FACETS: CardFilterFacet[] = [
  { key: "energy", type: "number", min: 0, max: 9 },
  { key: "might", type: "number", min: 0, max: 8 },
  { key: "domain", type: "value", values: ["Fury", "Calm", "Mind", "Body"] },
  { key: "rarity", type: "value", values: ["Common", "Rare", "Epic"] },
];

const FIELDS = buildSearchFields(FACETS, {
  setCodes: ["OGN", "SFD"],
  types: ["Unit", "Spell", "Battlefield Rune"],
  languages: ["en", "fr"],
});

describe("buildSearchFields", () => {
  it("tire les champs des facettes et des listes du jeu", () => {
    assert.deepEqual(
      FIELDS.map((field) => field.key),
      ["energy", "might", "domain", "rarity", "set", "type", "lang"]
    );
  });

  it("attribue un raccourci d'une lettre quand elle ne désigne qu'un champ", () => {
    assert.equal(FIELDS.find((field) => field.key === "energy")?.alias, "e");
    assert.equal(FIELDS.find((field) => field.key === "domain")?.alias, "d");
    assert.equal(FIELDS.find((field) => field.key === "lang")?.alias, "l");
  });

  it("n'attribue aucun raccourci quand deux champs partagent leur initiale", () => {
    // Un `m` qui désignerait tantôt `might`, tantôt `mana` vaut moins que pas
    // de raccourci du tout.
    const fields = buildSearchFields([
      { key: "might", type: "number", min: 0, max: 8 },
      { key: "mana", type: "number", min: 0, max: 8 },
    ]);

    assert.equal(fields.find((field) => field.key === "might")?.alias, undefined);
    assert.equal(fields.find((field) => field.key === "mana")?.alias, undefined);
  });
});

describe("splitSearchWords", () => {
  it("garde d'un bloc une valeur entre guillemets", () => {
    assert.deepEqual(splitSearchWords('type:"Battlefield Rune" fury'), ['type:"Battlefield Rune"', "fury"]);
  });
});

describe("parseSearchSyntax", () => {
  it("laisse au texte libre ce qui n'est pas un token", () => {
    const parsed = parseSearchSyntax("rift vanguard", FIELDS);

    assert.equal(parsed.text, "rift vanguard");
    assert.deepEqual(parsed.tokens, []);
  });

  it("sépare les tokens du texte libre", () => {
    const parsed = parseSearchSyntax("domain:fury energy<=3 deathknell", FIELDS);

    assert.equal(parsed.text, "deathknell");
    assert.deepEqual(parsed.criteria.values, { domain: ["Fury"] });
    assert.deepEqual(parsed.criteria.ranges, { energy: { max: 3 } });
  });

  it("accepte les raccourcis d'une lettre", () => {
    const parsed = parseSearchSyntax("d:calm e>=5", FIELDS);

    assert.deepEqual(parsed.criteria.values, { domain: ["Calm"] });
    assert.deepEqual(parsed.criteria.ranges, { energy: { min: 5 } });
  });

  it("rend la casse de la base, pas celle de la saisie", () => {
    const parsed = parseSearchSyntax("domain:FURY", FIELDS);

    assert.deepEqual(parsed.criteria.values, { domain: ["Fury"] });
  });

  it("cumule deux bornes sur le même attribut", () => {
    const parsed = parseSearchSyntax("energy>=2 energy<=5", FIELDS);

    assert.deepEqual(parsed.criteria.ranges, { energy: { min: 2, max: 5 } });
  });

  it("garde la borne la plus restrictive", () => {
    const parsed = parseSearchSyntax("energy<=5 energy<=3", FIELDS);

    assert.deepEqual(parsed.criteria.ranges, { energy: { max: 3 } });
  });

  it("réunit deux valeurs d'un même attribut", () => {
    const parsed = parseSearchSyntax("d:fury d:calm", FIELDS);

    assert.deepEqual(parsed.criteria.values, { domain: ["Fury", "Calm"] });
  });

  it("traduit `=` en plage d'un seul point", () => {
    assert.deepEqual(parseSearchSyntax("energy=4", FIELDS).criteria.ranges, { energy: { min: 4, max: 4 } });
  });

  it("prend la borne entière voisine pour un opérateur strict", () => {
    assert.deepEqual(parseSearchSyntax("energy<3", FIELDS).criteria.ranges, { energy: { max: 2 } });
    assert.deepEqual(parseSearchSyntax("energy>3", FIELDS).criteria.ranges, { energy: { min: 4 } });
  });

  it("laisse `e:` au texte libre : il désigne une extension de longue date", () => {
    const parsed = parseSearchSyntax("e:OGN", FIELDS);

    assert.equal(parsed.text, "e:OGN");
    assert.deepEqual(parsed.criteria.ranges, {});
  });

  it("lit les champs communs du jeu", () => {
    const parsed = parseSearchSyntax('set:OGN type:"Battlefield Rune" lang:fr', FIELDS);

    assert.equal(parsed.setCode, "OGN");
    assert.equal(parsed.type, "Battlefield Rune");
    assert.equal(parsed.lang, "fr");
    assert.equal(parsed.text, "");
  });

  it("signale une valeur que le jeu ne porte pas", () => {
    const parsed = parseSearchSyntax("domain:dragon", FIELDS);

    assert.deepEqual(parsed.rejected, [{ raw: "domain:dragon", field: "domain", reason: "value" }]);
    assert.deepEqual(parsed.criteria.values, {});
    assert.equal(parsed.text, "");
  });

  it("signale une borne qui n'est pas un nombre", () => {
    const parsed = parseSearchSyntax("energy<=beaucoup", FIELDS);

    assert.deepEqual(parsed.rejected, [{ raw: "energy<=beaucoup", field: "energy", reason: "number" }]);
  });

  it("signale une comparaison sur un attribut à valeurs", () => {
    const parsed = parseSearchSyntax("domain>=fury", FIELDS);

    assert.deepEqual(parsed.rejected, [{ raw: "domain>=fury", field: "domain", reason: "operator" }]);
  });

  it("laisse au texte libre un champ inconnu", () => {
    const parsed = parseSearchSyntax("cn:125", FIELDS);

    assert.equal(parsed.text, "cn:125");
    assert.deepEqual(parsed.rejected, []);
  });
});

describe("mergeSearchCriteria", () => {
  it("réunit les valeurs et cumule les bornes", () => {
    const merged = mergeSearchCriteria(
      { ranges: { energy: { min: 1 } }, values: { domain: ["Mind"] }, sort: { key: "name", direction: "asc" } },
      { ranges: { energy: { max: 5 } }, values: { domain: ["Fury"] } }
    );

    assert.deepEqual(merged.ranges, { energy: { min: 1, max: 5 } });
    assert.deepEqual(merged.values, { domain: ["Mind", "Fury"] });
    assert.deepEqual(merged.sort, { key: "name", direction: "asc" });
  });

  it("ne double pas une valeur présente des deux côtés", () => {
    const merged = mergeSearchCriteria({ ranges: {}, values: { domain: ["Fury"] } }, { ranges: {}, values: { domain: ["Fury"] } });

    assert.deepEqual(merged.values, { domain: ["Fury"] });
  });
});

describe("removeSearchWord", () => {
  it("retire le mot demandé et laisse le reste intact", () => {
    assert.equal(removeSearchWord("domain:Fury energy<=3 dragon", "energy<=3"), "domain:Fury dragon");
  });

  it("ne retire qu'une occurrence", () => {
    assert.equal(removeSearchWord("d:Fury d:Fury", "d:Fury"), "d:Fury");
  });

  it("laisse la saisie telle quelle si le mot n'y est pas", () => {
    assert.equal(removeSearchWord("dragon", "energy<=3"), "dragon");
  });
});

describe("currentWord et applyTokenSuggestion", () => {
  it("ne complète rien après une espace", () => {
    assert.equal(currentWord("domain:fury "), "");
  });

  it("complète le dernier mot", () => {
    assert.equal(currentWord("domain:fury ene"), "ene");
  });

  it("remplace le mot en cours et laisse la place au suivant", () => {
    assert.equal(applyTokenSuggestion("domain:fury ene", "energy<=3"), "domain:fury energy<=3 ");
  });

  it("ajoute à la suite quand rien n'est en cours de frappe", () => {
    assert.equal(applyTokenSuggestion("domain:fury ", "energy<=3"), "domain:fury energy<=3 ");
  });
});

describe("suggestTokens", () => {
  it("propose ce que le jeu sait faire quand rien n'est tapé", () => {
    const tokens = suggestTokens("", FIELDS).map((suggestion) => suggestion.token);

    assert.ok(tokens.some((token) => token.startsWith("energy")));
    assert.ok(tokens.includes("domain:Fury"));
  });

  it("complète par les valeurs réelles une fois le champ tapé", () => {
    assert.deepEqual(
      suggestTokens("domain:", FIELDS).map((suggestion) => suggestion.token),
      ["domain:Fury", "domain:Calm", "domain:Mind", "domain:Body"]
    );
  });

  it("filtre les valeurs sur ce qui est déjà tapé", () => {
    assert.deepEqual(
      suggestTokens("d:ca", FIELDS).map((suggestion) => suggestion.token),
      ["domain:Calm"]
    );
  });

  it("trouve le champ depuis la valeur seule", () => {
    assert.deepEqual(
      suggestTokens("fur", FIELDS).map((suggestion) => suggestion.token),
      ["domain:Fury"]
    );
  });

  it("met des guillemets autour d'une valeur qui contient une espace", () => {
    assert.ok(
      suggestTokens("type:battle", FIELDS)
        .map((suggestion) => suggestion.token)
        .includes('type:"Battlefield Rune"')
    );
  });

  it("ne propose pas un token déjà présent dans la saisie", () => {
    const tokens = suggestTokens("domain:Fury ", FIELDS).map((suggestion) => suggestion.token);

    assert.ok(!tokens.includes("domain:Fury"));
  });
});
