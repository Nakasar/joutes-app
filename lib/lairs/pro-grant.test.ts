import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lairHoldsPro } from "@/lib/subscriptions/grants";

/**
 * La composition « parrainage ou octroi » qui décide du Pro d'un lieu.
 *
 * Ces cas éprouvent **la fonction que `lairHasPro` appelle vraiment**, et non
 * une copie : une première version rejouait ici une réimplémentation à la main,
 * qui aurait laissé passer n'importe quelle régression du code réel tout en
 * affichant du vert.
 *
 * Exécution : `npm run test`.
 */

describe("lairHoldsPro", () => {
  it("un lieu sans parrain ni octroi n'est pas Pro", () => {
    assert.equal(lairHoldsPro({ hasGrant: false, paid: [], granted: [] }), false);
  });

  it("le parrainage seul suffit", () => {
    assert.equal(lairHoldsPro({ hasGrant: false, paid: ["pro"], granted: [] }), true);
  });

  it("l'octroi seul suffit — c'est tout l'objet de la fonctionnalité", () => {
    // Le cas d'une boutique partenaire qu'aucun compte ne parraine.
    assert.equal(lairHoldsPro({ hasGrant: true, paid: [], granted: [] }), true);
  });

  it("les deux à la fois restent Pro", () => {
    assert.equal(lairHoldsPro({ hasGrant: true, paid: ["pro"], granted: [] }), true);
  });

  it("un parrain d'un autre palier ne suffit pas", () => {
    assert.equal(lairHoldsPro({ hasGrant: false, paid: ["expert"], granted: [] }), false);
    assert.equal(lairHoldsPro({ hasGrant: false, paid: [], granted: ["supporter"] }), false);
  });

  it("un parrain dont le Pro est offert par l'équipe compte comme un payant", () => {
    assert.equal(lairHoldsPro({ hasGrant: false, paid: [], granted: ["pro"] }), true);
  });
});
