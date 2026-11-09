import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeRedirectPath } from "./safe-redirect.ts";

describe("safeRedirectPath", () => {
  it("garde un chemin interne, avec sa requête et son ancre", () => {
    assert.equal(safeRedirectPath("/events/42?tab=inscrits#haut"), "/events/42?tab=inscrits#haut");
    assert.equal(safeRedirectPath("/api/game-matches/abc/join"), "/api/game-matches/abc/join");
  });

  it("refuse les adresses qui exécutent du script", () => {
    assert.equal(safeRedirectPath("javascript:alert(1)"), "/");
    assert.equal(safeRedirectPath("JaVaScRiPt:alert(1)"), "/");
    assert.equal(safeRedirectPath("data:text/html,<script>1</script>"), "/");
  });

  it("refuse les adresses qui sortent du site", () => {
    assert.equal(safeRedirectPath("https://ailleurs.example/login"), "/");
    assert.equal(safeRedirectPath("//ailleurs.example"), "/");
    assert.equal(safeRedirectPath("/\\ailleurs.example"), "/");
    assert.equal(safeRedirectPath("/\t/ailleurs.example"), "/");
    assert.equal(safeRedirectPath("ailleurs.example"), "/");
  });

  it("rend le repli quand rien n'est demandé", () => {
    assert.equal(safeRedirectPath(null), "/");
    assert.equal(safeRedirectPath(""), "/");
    assert.equal(safeRedirectPath(undefined, "/account"), "/account");
  });
});
