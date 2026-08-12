import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardSearchText, parseCardSearch } from "./search-query";

/**
 * Saisie de la barre de recherche des éditeurs de booster et de paquet de cube.
 * Ce qui compte ici : les tokens du jeu partent intacts vers l'API, qui sait
 * les lire, et le raccourci historique du nombre seul reste un numéro de
 * collection.
 *
 * Exécution : `npm run test`.
 */

describe("cardSearchText", () => {
  it("fait d'un nombre seul un numéro de collection", () => {
    assert.equal(cardSearchText("125"), "cn:125");
    assert.equal(cardSearchText("  007 "), "cn:007");
  });

  it("laisse passer les tokens du jeu tels quels", () => {
    // Sans ça, l'API ne verrait jamais les attributs tapés dans la barre.
    assert.equal(cardSearchText("domain:fury energy<=3"), "domain:fury energy<=3");
    assert.equal(cardSearchText("e:OGN cn:001"), "e:OGN cn:001");
  });

  it("laisse le texte libre intact, chiffres compris", () => {
    assert.equal(cardSearchText("agent 47"), "agent 47");
    assert.equal(cardSearchText(""), "");
  });
});

describe("parseCardSearch", () => {
  it("sort l'extension, le numéro et la langue de la saisie", () => {
    assert.deepEqual(parseCardSearch("e:OGN cn:001 lang:fr deathknell"), {
      setCode: "OGN",
      cn: "001",
      lang: "fr",
      text: "deathknell",
    });
  });

  it("accepte « set: » comme « e: »", () => {
    assert.equal(parseCardSearch("set:ogn").setCode, "OGN");
  });

  it("laisse les attributs du jeu dans le texte", () => {
    // Ils ne sont pas de son ressort : c'est l'API qui les lit.
    assert.equal(parseCardSearch("domain:fury energy<=3").text, "domain:fury energy<=3");
  });
});
