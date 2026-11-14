import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { artSource, artUrl, isCardId } from "./art.ts";

describe("illustrations de la table filmée", () => {
  it("ne relaie que les hébergeurs connus, en https", () => {
    assert.equal(artSource(undefined), null);
    assert.equal(artSource("pas une adresse"), null);
    assert.equal(artSource("http://cmsassets.rgpub.io/a.png"), null);
    assert.equal(artSource("https://exemple.org/a.png"), null);
    assert.equal(artSource("https://cmsassets.rgpub.io.exemple.org/a.png"), null);
  });

  it("demande une vignette à l'hébergeur qui sait réduire", () => {
    assert.equal(
      artSource("https://cmsassets.rgpub.io/sanity/a-744x1039.png?accountingTag=RB"),
      "https://cmsassets.rgpub.io/sanity/a-744x1039.png?accountingTag=RB&w=372",
    );
  });

  it("reconnaît un identifiant de carte du catalogue", () => {
    assert.ok(isCardId("OGN042"));
    assert.ok(isCardId("OGN030a"));
    assert.ok(isCardId("SFD-207"));
    assert.ok(!isCardId("../../etc"));
    assert.ok(!isCardId("OGN042?x=1"));
    assert.equal(artUrl("OGN030a"), "/api/games/riftbound/play/filmed/art/OGN030a");
  });
});
