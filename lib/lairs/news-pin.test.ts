import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LairNewsItem } from "@/lib/types/Lair";
import { newlyPinnedNews } from "./news-pin";

const item = (id: string, pinned = false): LairNewsItem => ({
  id,
  title: `Annonce ${id}`,
  publishedAt: "2026-09-23T10:00:00Z",
  pinned,
});

describe("annonce nouvellement épinglée", () => {
  it("repère l'épinglage d'une annonce existante ou nouvelle", () => {
    assert.equal(newlyPinnedNews([item("a"), item("b")], [item("a"), item("b", true)])?.id, "b");
    assert.equal(newlyPinnedNews([item("a")], [item("a"), item("c", true)])?.id, "c");
    assert.equal(newlyPinnedNews(undefined, [item("a", true)])?.id, "a");
  });

  it("repère le passage de l'épingle d'une annonce à une autre", () => {
    assert.equal(newlyPinnedNews([item("a", true), item("b")], [item("a"), item("b", true)])?.id, "b");
  });

  it("ignore une annonce déjà épinglée qu'on retouche, et un désépinglage", () => {
    assert.equal(newlyPinnedNews([item("a", true)], [{ ...item("a", true), title: "Corrigé" }]), null);
    assert.equal(newlyPinnedNews([item("a", true)], [item("a")]), null);
  });
});
