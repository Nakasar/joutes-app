import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { httpUrl, isHttpUrl } from "./http-url.ts";

describe("httpUrl", () => {
  it("accepte une adresse web", () => {
    assert.equal(httpUrl().safeParse("https://joutes.app/events/1?x=1").success, true);
    assert.equal(httpUrl().safeParse("http://boutique.example").success, true);
  });

  it("refuse ce qui s'exécute ou n'est pas du web", () => {
    for (const value of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "file:///etc/passwd", "boutique.example", ""]) {
      assert.equal(httpUrl().safeParse(value).success, false, value);
    }
  });

  it("isHttpUrl dit la même chose sans schéma", () => {
    assert.equal(isHttpUrl("https://joutes.app"), true);
    assert.equal(isHttpUrl("vbscript:x"), false);
  });
});
