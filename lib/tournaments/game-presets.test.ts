import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GAME_TOURNAMENT_PRESETS,
  defaultPresetForGameSlug,
  getPreset,
  missingRequiredStats,
  presetStatKeys,
} from "@/lib/tournaments/game-presets";

/**
 * Tests des presets de jeu. Deux règles s'y jouent : le preset retenu d'office
 * pour un jeu (les tournois de figurines à grande armée relèvent leurs scores
 * sans qu'on ait à y penser) et la complétude des statistiques exigées, qui
 * décide de l'acceptation d'un résultat.
 *
 * Exécution : `npm run test`.
 */

describe("presets de jeu", () => {
  it("retient le score de bataille pour les jeux à grande armée", () => {
    for (const slug of ["w40k", "warhammer", "legion"]) {
      const preset = defaultPresetForGameSlug(slug);
      assert.equal(preset?.key, "battle-points", `preset par défaut de ${slug}`);
      assert.equal(preset?.defaults.requireStats, true, "saisie exigée par défaut");
    }
  });

  it("ne retient aucun preset d'office ailleurs", () => {
    assert.equal(defaultPresetForGameSlug("shatterpoint"), undefined);
    assert.equal(defaultPresetForGameSlug("riftbound"), undefined);
    assert.equal(defaultPresetForGameSlug(undefined), undefined);
  });

  it("départage par score de bataille puis résistance, jamais par destruction", () => {
    const preset = getPreset("battle-points");
    assert.deepEqual(presetStatKeys(preset), ["battlePoints", "pointsDestroyed"]);
    // Les points de match passent avant cette chaîne : elle commence donc au
    // score de bataille, et la destruction n'y figure pas — elle n'est
    // conservée que pour l'historique.
    assert.deepEqual(preset?.tiebreakers, ["stat:battlePoints", "omw"]);
  });

  it("n'expose qu'un seul preset par défaut pour un jeu donné", () => {
    // `defaultPresetForGameSlug` renvoie le premier : deux presets d'office sur
    // le même jeu rendraient le choix arbitraire.
    const slugs = GAME_TOURNAMENT_PRESETS.filter((p) => p.applyByDefault).flatMap((p) => p.gameSlugs);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  describe("missingRequiredStats", () => {
    const keys = ["battlePoints", "pointsDestroyed"];

    it("accepte une saisie complète", () => {
      const stats = {
        a: { battlePoints: 82, pointsDestroyed: 1240 },
        b: { battlePoints: 55, pointsDestroyed: 900 },
      };
      assert.deepEqual(missingRequiredStats(stats, ["a", "b"], keys), []);
    });

    it("relève un zéro comme une valeur saisie", () => {
      // Zéro point détruit est un résultat, pas une absence de saisie.
      const stats = { a: { battlePoints: 0, pointsDestroyed: 0 } };
      assert.deepEqual(missingRequiredStats(stats, ["a"], keys), []);
    });

    it("relève le joueur et la statistique manquants", () => {
      const stats = { a: { battlePoints: 82 } };
      assert.deepEqual(missingRequiredStats(stats, ["a", "b"], keys), [
        { playerId: "a", key: "pointsDestroyed" },
        { playerId: "b", key: "battlePoints" },
        { playerId: "b", key: "pointsDestroyed" },
      ]);
    });

    it("n'exige rien quand la phase ne relève aucune statistique", () => {
      assert.deepEqual(missingRequiredStats(undefined, ["a", "b"], []), []);
    });
  });
});
