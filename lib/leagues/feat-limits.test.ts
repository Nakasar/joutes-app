import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Feat } from "@/lib/types/League";
import { decideFeatAward } from "./feat-limits";

function feat(overrides: Partial<Feat> = {}): Feat {
  return { id: "f1", title: "Beau geste", points: 2, ...overrides };
}

describe("decideFeatAward", () => {
  it("accorde un haut fait sans limite, quel que soit le décompte", () => {
    assert.deepEqual(decideFeatAward(feat(), { inLeague: 0, inEvent: 0 }), { counted: true, feat: feat() });
    assert.deepEqual(decideFeatAward(feat(), { inLeague: 42, inEvent: 7 }), { counted: true, feat: feat() });
  });

  it("refuse un haut fait absent du catalogue", () => {
    assert.deepEqual(decideFeatAward(undefined, { inLeague: 0, inEvent: 0 }), {
      counted: false,
      reason: "unknown-feat",
    });
  });

  it("oppose maxPerEvent au sein d'un même match", () => {
    const rule = feat({ maxPerEvent: 2 });
    assert.deepEqual(decideFeatAward(rule, { inLeague: 0, inEvent: 1 }), { counted: true, feat: rule });
    assert.deepEqual(decideFeatAward(rule, { inLeague: 0, inEvent: 2 }), {
      counted: false,
      reason: "max-per-event",
    });
  });

  it("oppose maxPerLeague sur l'ensemble de la ligue", () => {
    const rule = feat({ maxPerLeague: 3 });
    assert.deepEqual(decideFeatAward(rule, { inLeague: 2, inEvent: 0 }), { counted: true, feat: rule });
    assert.deepEqual(decideFeatAward(rule, { inLeague: 3, inEvent: 0 }), {
      counted: false,
      reason: "max-per-league",
    });
  });

  it("nomme la limite du match d'abord quand les deux sont atteintes", () => {
    // L'ordre compte pour le message rendu à l'organisateur : la limite la plus
    // proche de son geste est la plus utile à lui montrer.
    const rule = feat({ maxPerEvent: 1, maxPerLeague: 1 });
    assert.deepEqual(decideFeatAward(rule, { inLeague: 1, inEvent: 1 }), {
      counted: false,
      reason: "max-per-event",
    });
  });

  it("traite une limite à zéro comme un refus, pas comme une absence de limite", () => {
    assert.deepEqual(decideFeatAward(feat({ maxPerEvent: 0 }), { inLeague: 0, inEvent: 0 }), {
      counted: false,
      reason: "max-per-event",
    });
    assert.deepEqual(decideFeatAward(feat({ maxPerLeague: 0 }), { inLeague: 0, inEvent: 0 }), {
      counted: false,
      reason: "max-per-league",
    });
  });

  it("n'oppose pas une limite de match à une limite de ligue", () => {
    // Deux quotas indépendants : trois fois dans la ligue n'empêche pas une
    // première attribution dans un match qui en autorise deux.
    const rule = feat({ maxPerEvent: 2, maxPerLeague: 10 });
    assert.deepEqual(decideFeatAward(rule, { inLeague: 3, inEvent: 0 }), { counted: true, feat: rule });
  });
});
