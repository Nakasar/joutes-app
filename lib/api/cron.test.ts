import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCronAuthorized } from "./cron.ts";

function request(authorization?: string): Request {
  return new Request("https://joutes.app/api/cron/x", {
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe("isCronAuthorized", () => {
  it("accepte le secret attendu", () => {
    assert.equal(isCronAuthorized(request("Bearer s3cret"), "s3cret"), true);
  });

  it("refuse un secret différent, plus court ou plus long", () => {
    assert.equal(isCronAuthorized(request("Bearer s3creT"), "s3cret"), false);
    assert.equal(isCronAuthorized(request("Bearer s3"), "s3cret"), false);
    assert.equal(isCronAuthorized(request("Bearer s3cret-et-plus"), "s3cret"), false);
  });

  it("refuse l'absence d'en-tête", () => {
    assert.equal(isCronAuthorized(request(), "s3cret"), false);
  });

  it("refuse tout quand le secret n'est pas configuré", () => {
    assert.equal(isCronAuthorized(request("Bearer undefined"), undefined), false);
    assert.equal(isCronAuthorized(request("Bearer "), ""), false);
  });
});
