import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { filterContents, mergeContents, readContentFilter, sortContents } from "./items";

/**
 * Le rangement des contenus d'une vitrine.
 *
 * Exécution : `npm run test`.
 */

const item = (id: string, publishedAt: string, kind: "video" | "article" | "replay" = "video") => ({
  id,
  kind,
  publishedAt,
});

describe("readContentFilter", () => {
  it("retombe sur « tout »", () => {
    assert.equal(readContentFilter(undefined), "all");
    assert.equal(readContentFilter("podcast"), "all");
    assert.equal(readContentFilter("article"), "article");
  });
});

describe("sortContents", () => {
  it("range du plus récent au plus ancien sans muter l'entrée", () => {
    const input = [item("a", "2024-01-01T00:00:00.000Z"), item("b", "2025-01-01T00:00:00.000Z")];
    const sorted = sortContents(input);

    assert.deepEqual(sorted.map((entry) => entry.id), ["b", "a"]);
    assert.deepEqual(input.map((entry) => entry.id), ["a", "b"]);
  });
});

describe("mergeContents", () => {
  it("mêle les deux listes dans l'ordre des dates", () => {
    const merged = mergeContents(
      [item("groupe", "2024-06-01T00:00:00.000Z")],
      [item("membre", "2025-01-01T00:00:00.000Z")],
    );

    assert.deepEqual(merged.map((entry) => entry.id), ["membre", "groupe"]);
  });

  it("garde la version du groupe en cas de doublon", () => {
    const merged = mergeContents(
      [item("x", "2024-01-01T00:00:00.000Z", "article")],
      [item("x", "2025-01-01T00:00:00.000Z", "video")],
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0].kind, "article");
  });
});

describe("filterContents", () => {
  it("ne retient que le genre demandé", () => {
    const items = [item("a", "2024-01-01T00:00:00.000Z", "video"), item("b", "2024-01-02T00:00:00.000Z", "article")];

    assert.deepEqual(filterContents(items, "article").map((entry) => entry.id), ["b"]);
    assert.equal(filterContents(items, "all").length, 2);
  });
});
