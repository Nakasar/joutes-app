import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { escapeRegex } from "./regex.ts";

describe("escapeRegex", () => {
  it("laisse un texte ordinaire intact", () => {
    assert.equal(escapeRegex("Teemo, éclaireur"), "Teemo, éclaireur");
  });

  it("neutralise tout ce qui a un sens dans une expression", () => {
    const hostile = ".*+?^${}()|[]\\";
    assert.ok(new RegExp(`^${escapeRegex(hostile)}$`).test(hostile));
    assert.equal(new RegExp(escapeRegex(".*")).test("n'importe quoi"), false);
  });

  it("rend valide une saisie qui ne l'était pas", () => {
    assert.doesNotThrow(() => new RegExp(escapeRegex("(a+")));
  });
});
