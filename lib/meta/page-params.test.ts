import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { metaHref, parseMetaPageParams, thresholdChoices } from "./page-params";
import { resolveMetaSettings } from "./settings";

describe("seuil des staples dans l'adresse", () => {
  const settings = resolveMetaSettings({ stapleThreshold: 0.625 });

  it("propose le seuil du jeu au dixième", () => {
    assert.deepEqual(thresholdChoices(settings), [60, 62.5, 75, 90]);
  });

  it("garde la valeur exacte du jeu et ne l'écrit pas dans l'adresse", () => {
    const state = parseMetaPageParams({ seuil: "62.5" }, settings);
    assert.equal(state.threshold, 0.625);
    assert.equal(metaHref("/m", state, settings, { threshold: 62.5 / 100 }), "/m");
  });

  it("écrit un autre seuil", () => {
    const state = parseMetaPageParams({ seuil: "90" }, settings);
    assert.equal(state.threshold, 0.9);
    assert.equal(metaHref("/m", state, settings), "/m?seuil=90");
  });
});
