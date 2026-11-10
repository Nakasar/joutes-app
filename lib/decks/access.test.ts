import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canReadDeck, needsShareLookup } from "./access";

/**
 * Qui lit un deck. Ce que ces cas verrouillent : un deck privé partagé à un
 * groupe s'ouvre aux membres de ce groupe, et à personne d'autre — pas même à
 * un visiteur non connecté qui en aurait le lien.
 *
 * Exécution : `npm run test`.
 */

describe("canReadDeck", () => {
  const privateDeck = { visibility: "private" as const, playerId: "auteur" };

  it("ouvre un deck public ou non répertorié à tous", () => {
    assert.equal(canReadDeck({ visibility: "public", playerId: "auteur" }, null, false), true);
    assert.equal(canReadDeck({ visibility: "unlisted", playerId: "auteur" }, null, false), true);
  });

  it("ouvre un deck privé à son auteur", () => {
    assert.equal(canReadDeck(privateDeck, "auteur", false), true);
  });

  it("ouvre un deck privé partagé au lecteur par un groupe", () => {
    assert.equal(canReadDeck(privateDeck, "membre", true), true);
  });

  it("le referme à tous les autres", () => {
    assert.equal(canReadDeck(privateDeck, "inconnu", false), false);
    assert.equal(canReadDeck(privateDeck, null, true), false);
  });
});

describe("needsShareLookup", () => {
  it("ne lit les partages que pour le deck privé d'un autre", () => {
    assert.equal(needsShareLookup({ visibility: "public", playerId: "auteur" }, "membre"), false);
    assert.equal(needsShareLookup({ visibility: "private", playerId: "auteur" }, "auteur"), false);
    assert.equal(needsShareLookup({ visibility: "private", playerId: "auteur" }, null), false);
    assert.equal(needsShareLookup({ visibility: "private", playerId: "auteur" }, "membre"), true);
  });
});
