import assert from "node:assert/strict";
import { test } from "node:test";

import { localizedAlternates } from "./alternates.ts";

test("le français n'a pas de préfixe et sert de x-default", () => {
  const alternates = localizedAlternates("/games/riftbound/cards/ogn-001", "en");
  assert.equal(alternates.canonical, "/en/games/riftbound/cards/ogn-001");
  assert.deepEqual(alternates.languages, {
    en: "/en/games/riftbound/cards/ogn-001",
    fr: "/games/riftbound/cards/ogn-001",
    it: "/it/games/riftbound/cards/ogn-001",
    de: "/de/games/riftbound/cards/ogn-001",
    "x-default": "/games/riftbound/cards/ogn-001",
  });
});

test("l'accueil", () => {
  const alternates = localizedAlternates("/", "fr");
  assert.equal(alternates.canonical, "/");
  assert.equal(alternates.languages.de, "/de");
});
