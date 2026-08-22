import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SHOWCASE_STEP_KEYS, readShowcaseCompletion } from "./completion";

/**
 * L'avancement d'une vitrine.
 *
 * Le cas qui compte : une étape qu'un compte ne peut pas atteindre — la
 * bannière sans abonnement — ne doit pas plafonner sa jauge. Un compteur qu'on
 * ne peut pas finir sans payer découragerait de le finir du tout.
 *
 * Exécution : `npm run test`.
 */

const empty = {
  hasDisplayName: false,
  hasAvatar: false,
  hasDescription: false,
  hasBanner: false,
  canUseBanner: true,
  followedGames: 0,
  followedLairs: 0,
  isPublic: false,
};

const full = {
  hasDisplayName: true,
  hasAvatar: true,
  hasDescription: true,
  hasBanner: true,
  canUseBanner: true,
  followedGames: 2,
  followedLairs: 0,
  isPublic: true,
};

describe("readShowcaseCompletion", () => {
  it("rend les cinq étapes, toujours dans le même ordre", () => {
    assert.deepEqual(
      readShowcaseCompletion(empty).steps.map((step) => step.key),
      [...SHOWCASE_STEP_KEYS],
    );
  });

  it("compte 0 % sur un compte neuf et 100 % sur un compte complet", () => {
    assert.equal(readShowcaseCompletion(empty).percent, 0);
    assert.equal(readShowcaseCompletion(empty).complete, false);
    assert.equal(readShowcaseCompletion(full).percent, 100);
    assert.equal(readShowcaseCompletion(full).complete, true);
  });

  it("ne compte pas la bannière quand le palier ne l'ouvre pas", () => {
    const completion = readShowcaseCompletion({ ...full, hasBanner: false, canUseBanner: false });

    assert.equal(completion.percent, 100);
    assert.equal(completion.complete, true);
    assert.equal(completion.steps.find((step) => step.key === "banner")?.locked, true);
  });

  it("ne coche l'identité que si l'avatar et la description sont là", () => {
    const half = readShowcaseCompletion({ ...empty, hasAvatar: true });
    assert.equal(half.steps.find((step) => step.key === "identity")?.done, false);

    const both = readShowcaseCompletion({ ...empty, hasAvatar: true, hasDescription: true });
    assert.equal(both.steps.find((step) => step.key === "identity")?.done, true);
  });

  it("accepte des jeux ou des lieux pour l'étape des suivis", () => {
    assert.equal(
      readShowcaseCompletion({ ...empty, followedLairs: 1 }).steps.find(
        (step) => step.key === "follows",
      )?.done,
      true,
    );
  });

  it("arrondit la jauge à l'entier", () => {
    // Deux étapes sur cinq : 40 %, pas 40.000000000000004.
    const completion = readShowcaseCompletion({ ...empty, hasDisplayName: true, isPublic: true });

    assert.equal(completion.percent, 40);
    assert.equal(Number.isInteger(completion.percent), true);
  });
});
