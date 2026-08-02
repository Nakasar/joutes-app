import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MeilisearchApiError } from "meilisearch";
import { cardIndexSettings, isUndeclaredCriteriaError } from "./meilisearch";

/**
 * Ce qui compte ici : l'exploration des cartes ne doit se replier sur une
 * recherche sans filtres que lorsque l'index refuse explicitement les critères.
 * Confondre une panne avec un index mal réglé rendrait des résultats non
 * filtrés en guise d'erreur, sur une page qui a l'air de répondre.
 *
 * Exécution : `npm run test`.
 */

function apiError(code: string): MeilisearchApiError {
  return new MeilisearchApiError(new Response(null, { status: 400 }), {
    message: `Attribute \`energy\` is not filterable.`,
    code,
    type: "invalid_request",
    link: "https://www.meilisearch.com/docs/reference/errors/error_codes",
  });
}

describe("isUndeclaredCriteriaError", () => {
  it("reconnaît un filtre sur un attribut non déclaré", () => {
    assert.equal(isUndeclaredCriteriaError(apiError("invalid_search_filter")), true);
  });

  it("reconnaît un tri sur un attribut non déclaré", () => {
    assert.equal(isUndeclaredCriteriaError(apiError("invalid_search_sort")), true);
  });

  it("laisse remonter un index absent", () => {
    assert.equal(isUndeclaredCriteriaError(apiError("index_not_found")), false);
  });

  it("laisse remonter une clé refusée", () => {
    assert.equal(isUndeclaredCriteriaError(apiError("invalid_api_key")), false);
  });

  it("laisse remonter une panne réseau", () => {
    assert.equal(isUndeclaredCriteriaError(new TypeError("fetch failed")), false);
  });

  it("laisse remonter une erreur d'API sans corps exploitable", () => {
    assert.equal(
      isUndeclaredCriteriaError(new MeilisearchApiError(new Response(null, { status: 502 }))),
      false
    );
  });
});

describe("cardIndexSettings", () => {
  const indexConfig = { name: "mtg-cards", keys: { set: "set", collectorNumber: "collector_number" } };

  it("déclare les attributs du jeu en plus des filtres de base", () => {
    const settings = cardIndexSettings(indexConfig, {
      facetKeys: ["energy", "domain"],
      numericKeys: ["energy"],
    });

    assert.deepEqual(settings.filterableAttributes, [
      "set",
      "collector_number",
      "lang",
      "type",
      "energy",
      "domain",
    ]);
    assert.deepEqual(settings.sortableAttributes, ["name", "collector_number", "energy"]);
  });

  it("ne répète pas un attribut déjà couvert par les filtres de base", () => {
    const settings = cardIndexSettings(indexConfig, {
      facetKeys: ["type", "collector_number"],
      numericKeys: ["collector_number"],
    });

    assert.deepEqual(settings.filterableAttributes, ["set", "collector_number", "lang", "type"]);
    assert.deepEqual(settings.sortableAttributes, ["name", "collector_number"]);
  });
});
