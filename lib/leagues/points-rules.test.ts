import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_POINTS_RULES, normalizePointsRules, pointsForRank } from "./points-rules";

describe("normalizePointsRules", () => {
  it("complète un barème hérité sans nul ni table de rangs", () => {
    // Le cas des ligues créées avant les tournois rattachés : elles n'ont que
    // les trois champs d'origine en base.
    const rules = normalizePointsRules({ participation: 1, victory: 3, defeat: 0 });

    assert.equal(rules.participation, 1);
    assert.equal(rules.victory, 3);
    assert.equal(rules.defeat, 0);
    assert.equal(rules.draw, DEFAULT_POINTS_RULES.draw);
    assert.deepEqual(rules.rankPoints, []);
    assert.equal(rules.rankPointsBeyond, 0);
    assert.deepEqual(rules.feats, []);
  });

  it("rend le barème par défaut quand rien n'est fourni", () => {
    assert.deepEqual(normalizePointsRules(undefined), DEFAULT_POINTS_RULES);
    assert.deepEqual(normalizePointsRules(null), DEFAULT_POINTS_RULES);
  });

  it("conserve les valeurs présentes, y compris zéro", () => {
    const rules = normalizePointsRules({
      participation: 0,
      victory: 0,
      defeat: 0,
      draw: 0,
      rankPoints: [10, 6, 3],
      rankPointsBeyond: 1,
      feats: [{ id: "f1", title: "Perfect", points: 2 }],
    });

    assert.equal(rules.victory, 0);
    assert.equal(rules.draw, 0);
    assert.deepEqual(rules.rankPoints, [10, 6, 3]);
    assert.equal(rules.rankPointsBeyond, 1);
    assert.equal(rules.feats.length, 1);
  });

  it("écarte les hauts faits inexploitables et rattrape des points absents", () => {
    const rules = normalizePointsRules({
      feats: [
        { id: "f1", title: "Bien joué" },
        { title: "Sans identifiant" },
        null,
      ] as never,
    });

    assert.equal(rules.feats.length, 1);
    assert.equal(rules.feats[0].id, "f1");
    assert.equal(rules.feats[0].points, 0);
  });
});

describe("pointsForRank", () => {
  const rules = normalizePointsRules({ rankPoints: [10, 6, 3], rankPointsBeyond: 1 });

  it("lit la table pour les rangs qu'elle couvre", () => {
    assert.equal(pointsForRank(rules, 1), 10);
    assert.equal(pointsForRank(rules, 2), 6);
    assert.equal(pointsForRank(rules, 3), 3);
  });

  it("retombe sur la valeur au-delà pour les rangs suivants", () => {
    assert.equal(pointsForRank(rules, 4), 1);
    assert.equal(pointsForRank(rules, 40), 1);
  });

  it("ne rapporte rien sans table ni valeur au-delà", () => {
    const empty = normalizePointsRules({});
    assert.equal(pointsForRank(empty, 1), 0);
    assert.equal(pointsForRank(empty, 12), 0);
  });

  it("refuse un rang invalide", () => {
    assert.equal(pointsForRank(rules, 0), 0);
    assert.equal(pointsForRank(rules, -1), 0);
    assert.equal(pointsForRank(rules, 1.5), 0);
  });
});
