import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogLanguagesForSearch, getGameLanguages, toCollectionLanguage } from "./card-languages";
import { gameLanguagesSchema } from "@/lib/schemas/game.schema";

/**
 * Langues d'un jeu : la liste réglée depuis l'administration remplace celles
 * du catalogue, qui remplacent elles-mêmes le repli français / anglais.
 *
 * Exécution : `npm run test`.
 */
describe("getGameLanguages", () => {
  it("prend la liste du jeu quand l'administration l'a réglée, même sans cartes dans ces langues", () => {
    assert.deepEqual(getGameLanguages({ languages: ["fr", "en", "ko", "zh"] }, ["en"]), ["fr", "en", "ko", "zh"]);
  });

  it("suit le catalogue tant que le jeu n'a pas de liste", () => {
    assert.deepEqual(getGameLanguages({}, ["fr", "en", "en", "", null]), ["en", "fr"]);
  });

  it("retombe sur français et anglais quand le catalogue est vide", () => {
    assert.deepEqual(getGameLanguages(undefined, []), ["fr", "en"]);
  });
});

describe("toCollectionLanguage", () => {
  it("traduit un code du catalogue en langue d'exemplaire", () => {
    assert.equal(toCollectionLanguage("fr"), "FR");
    assert.equal(toCollectionLanguage("ko"), "KO");
    assert.equal(toCollectionLanguage("de"), undefined);
    assert.equal(toCollectionLanguage(undefined), undefined);
  });
});

describe("gameLanguagesSchema", () => {
  it("garde l'ordre et retire les doublons", () => {
    assert.deepEqual(gameLanguagesSchema.parse(["ko", "fr", "ko"]), ["ko", "fr"]);
  });

  it("refuse une liste vide ou une langue inconnue", () => {
    assert.equal(gameLanguagesSchema.safeParse([]).success, false);
    assert.equal(gameLanguagesSchema.safeParse(["xx"]).success, false);
  });
});

describe("catalogLanguagesForSearch", () => {
  it("ne filtre pas quand toutes les langues sont demandées", () => {
    assert.equal(catalogLanguagesForSearch("all", ["en"]), null);
  });

  it("cherche une carte française parmi les fiches françaises et anglaises", () => {
    assert.deepEqual(catalogLanguagesForSearch("fr", ["en", "fr"]), ["en", "fr"]);
  });

  it("retombe sur les fiches anglaises d'un jeu importé en anglais seulement", () => {
    assert.deepEqual(catalogLanguagesForSearch("fr", ["en"]), ["en", "fr"]);
  });

  it("garde les fiches françaises pour une carte anglaise d'un jeu importé en français seulement", () => {
    assert.equal(catalogLanguagesForSearch("en", ["fr"]), null);
    assert.equal(catalogLanguagesForSearch("de", ["fr"]), null);
  });

  it("garde le filtre tant que le catalogue est inconnu", () => {
    assert.deepEqual(catalogLanguagesForSearch("en", []), ["en"]);
  });
});
