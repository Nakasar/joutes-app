import { test } from "node:test";
import assert from "node:assert/strict";

import { readableCardText, toCatalogId, toEngineCode } from "./cards.ts";

test("un identifiant du catalogue devient un code du moteur", () => {
  assert.equal(toEngineCode("OGN001"), "OGN-001");
  assert.equal(toEngineCode("OGS23"), "OGS-023");
  assert.equal(toEngineCode("ogn-007"), "OGN-007");
});

test("une variante d'illustration désigne la même carte", () => {
  assert.equal(toEngineCode("OGN030a"), "OGN-030");
  assert.equal(toEngineCode("OGN299*"), "OGN-299");
});

test("un identifiant sans numéro n'a pas de code", () => {
  assert.equal(toEngineCode("jeton"), null);
  assert.equal(toEngineCode(""), null);
});

test("un code du moteur retrouve la carte de base du catalogue", () => {
  assert.equal(toCatalogId("OGN-030"), "OGN030");
});

test("readableCardText écrit les symboles en clair", () => {
  assert.equal(
    readableCardText(":rb_energy_2:, :rb_exhaust:: Give a unit +2 :rb_might:. Pay :rb_rune_fury: or :rb_rune_rainbow:."),
    "[2], [Exhaust]: Give a unit +2 Might. Pay [Fury] or [Any].",
  );
});
