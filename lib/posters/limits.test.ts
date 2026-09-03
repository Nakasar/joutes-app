import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canSavePoster, FREE_POSTER_LIMIT, hasReachedPosterLimit, posterLimitFor } from "./limits.ts";

describe("canSavePoster", () => {
  it("laisse une seule affiche à un compte sans abonnement", () => {
    assert.equal(canSavePoster({ existing: 0, unlimited: false }), true);
    assert.equal(canSavePoster({ existing: FREE_POSTER_LIMIT, unlimited: false }), false);
  });

  it("n'en compte aucune à un compte qui a le droit d'en garder plusieurs", () => {
    assert.equal(canSavePoster({ existing: 0, unlimited: true }), true);
    assert.equal(canSavePoster({ existing: 12, unlimited: true }), true);
  });
});

describe("hasReachedPosterLimit", () => {
  it("ferme la création à un compte qui en garde plus que la limite", () => {
    // Le cas de l'abonnement arrêté : trois affiches gardées, aucune perdue,
    // mais plus de quatrième.
    assert.equal(hasReachedPosterLimit({ existing: 3, unlimited: false }), true);
    assert.equal(hasReachedPosterLimit({ existing: 3, unlimited: true }), false);
    assert.equal(hasReachedPosterLimit({ existing: 0, unlimited: false }), false);
  });
});

describe("posterLimitFor", () => {
  it("rend le seuil à écrire, ou rien quand il n'y en a pas", () => {
    assert.equal(posterLimitFor(false), FREE_POSTER_LIMIT);
    assert.equal(posterLimitFor(true), null);
  });
});
