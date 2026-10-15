import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTRIBUTION_KINDS,
  contributionExcerpt,
  decodeContributionCursor,
  encodeContributionCursor,
  mergeContributionPages,
  readContributionKinds,
  type Contribution,
} from "@/lib/contributions/feed";

/**
 * Tests du fil des contributions.
 *
 * Ce qui s'y joue ne se voit pas sur une page seule : d'une page à la
 * suivante, aucune ligne ne doit manquer ni revenir, y compris quand
 * plusieurs contenus partagent la même date — ceux que l'on date par leur
 * `_id` ne le sont qu'à la seconde.
 *
 * Exécution : `npm run test`.
 */

function item(kind: Contribution["kind"], id: string, iso: string): Contribution {
  return { kind, id, title: id, publishedAt: new Date(iso) };
}

describe("mergeContributionPages", () => {
  it("fusionne les sources du plus récent au plus ancien", () => {
    const { items, next } = mergeContributionPages(
      [
        [item("deck", "d1", "2026-10-03T10:00:00Z"), item("deck", "d2", "2026-10-01T10:00:00Z")],
        [item("news", "n1", "2026-10-02T10:00:00Z")],
      ],
      { after: null, limit: 10 },
    );

    assert.deepEqual(
      items.map((i) => i.id),
      ["d1", "n1", "d2"],
    );
    assert.equal(next, null);
  });

  it("parcourt des dates égales sans perdre ni répéter de ligne", () => {
    const sameSecond = "2026-10-03T10:00:00Z";
    const events = ["e1", "e2", "e3", "e4", "e5"].map((id) => item("event", id, sameSecond));
    const lairs = [item("lair", "l1", sameSecond), item("lair", "l2", "2026-10-01T00:00:00Z")];

    const seen: string[] = [];
    let after = null;
    for (let page = 0; page < 10; page += 1) {
      // Chaque source relit tout ce qui est daté au plus tard du curseur,
      // comme le fait la requête `$lte`.
      const bound: Date | null = after ? (after as { publishedAt: Date }).publishedAt : null;
      const upTo = (list: Contribution[]) => list.filter((i) => !bound || i.publishedAt <= bound);
      const result = mergeContributionPages([upTo(events), upTo(lairs)], { after, limit: 2 });

      seen.push(...result.items.map((i) => `${i.kind}:${i.id}`));
      if (!result.next) break;
      after = decodeContributionCursor(encodeContributionCursor(result.next));
    }

    assert.deepEqual(seen, [
      "event:e1",
      "event:e2",
      "event:e3",
      "event:e4",
      "event:e5",
      "lair:l1",
      "lair:l2",
    ]);
  });
});

describe("decodeContributionCursor", () => {
  it("relit ce que encodeContributionCursor écrit, même avec un identifiant qui contient le séparateur", () => {
    const cursor = { publishedAt: new Date("2026-10-03T10:00:00.123Z"), kind: "play-group-content" as const, id: "a~b" };
    assert.deepEqual(decodeContributionCursor(encodeContributionCursor(cursor)), cursor);
  });

  it("ignore un curseur illisible", () => {
    assert.equal(decodeContributionCursor(undefined), null);
    assert.equal(decodeContributionCursor("abc~deck~1"), null);
    assert.equal(decodeContributionCursor("123~inconnu~1"), null);
    assert.equal(decodeContributionCursor("123~deck~"), null);
  });
});

describe("readContributionKinds", () => {
  it("garde les types connus, et tous quand aucun ne l'est", () => {
    assert.deepEqual(readContributionKinds("deck,news,deck,nope"), ["deck", "news"]);
    assert.deepEqual(readContributionKinds(undefined), [...CONTRIBUTION_KINDS]);
    assert.deepEqual(readContributionKinds("nope"), [...CONTRIBUTION_KINDS]);
  });
});

describe("contributionExcerpt", () => {
  it("aplatit les espaces et tronque les textes longs", () => {
    assert.equal(contributionExcerpt("  un\n\n  texte "), "un texte");
    assert.equal(contributionExcerpt(""), undefined);
    assert.equal(contributionExcerpt(42), undefined);
    assert.equal(contributionExcerpt("a".repeat(250))?.length, 201);
  });
});
