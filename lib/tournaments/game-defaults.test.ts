import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_FIXED_SCORING, DEFAULT_TIEBREAKERS } from "@/lib/types/Tournament";
import {
  presetOptionsForGame,
  resolveGameTournamentDefaults,
} from "@/lib/tournaments/game-defaults";

/**
 * Tests des réglages de tournoi d'un jeu. La règle qui s'y joue tient en une
 * phrase, et se casse discrètement : un réglage absent laisse la main au format
 * livré, un réglage posé le remplace. Confondre les deux ferait suivre au jeu
 * des règles que personne n'a choisies — ou figerait des règles officielles qui
 * évoluent.
 *
 * Exécution : `npm run test`.
 */

describe("réglages de tournoi d'un jeu", () => {
  it("suit le format livré quand rien n'est réglé", () => {
    const resolved = resolveGameTournamentDefaults("w40k", undefined);
    assert.equal(resolved.preset?.key, "battle-points");
    assert.deepEqual(resolved.tiebreakers, ["stat:battlePoints", "omw"]);
    // Le format livré exige la saisie des statistiques : sans elles, un tournoi
    // de grande armée ne peut pas départager.
    assert.equal(resolved.requireMatchStats, true);
    assert.deepEqual(resolved.scenarios, []);
  });

  it("retombe sur les défauts de la plateforme sans jeu ni preset", () => {
    const resolved = resolveGameTournamentDefaults("riftbound", undefined);
    assert.equal(resolved.preset, undefined);
    assert.deepEqual(resolved.tiebreakers, DEFAULT_TIEBREAKERS);
    assert.deepEqual(resolved.fixedScoring, DEFAULT_FIXED_SCORING);
    assert.equal(resolved.bestOf, 1);
    assert.equal(resolved.resultMode, "selection");
    assert.equal(resolved.swissPairing, "ranked");
    assert.equal(resolved.requireMatchStats, false);
  });

  it("distingue « aucune statistique » d'un réglage muet", () => {
    // `null` est un choix d'administration : le jeu ne relève plus rien, même
    // si son catalogue propose un format. Absent, il suivrait le catalogue.
    const none = resolveGameTournamentDefaults("w40k", { statsPresetKey: null });
    assert.equal(none.preset, undefined);
    assert.deepEqual(none.tiebreakers, DEFAULT_TIEBREAKERS);

    const silent = resolveGameTournamentDefaults("w40k", {});
    assert.equal(silent.preset?.key, "battle-points");
  });

  it("applique le preset choisi par l'administration", () => {
    const resolved = resolveGameTournamentDefaults("w40k", { statsPresetKey: "victory-points" });
    assert.equal(resolved.preset?.key, "victory-points");
    assert.deepEqual(resolved.tiebreakers, ["stat:victoryPoints", "omw", "gamesDiff"]);
  });

  it("ignore un preset disparu plutôt que de laisser le jeu sans statistiques", () => {
    const resolved = resolveGameTournamentDefaults("w40k", { statsPresetKey: "preset-retire" });
    assert.equal(resolved.preset?.key, "battle-points");
  });

  it("remplace chaque réglage posé, et laisse les autres au format livré", () => {
    const resolved = resolveGameTournamentDefaults("w40k", {
      fixedScoring: { win: 2, loss: 0, draw: 1 },
      bestOf: 3,
    });
    assert.deepEqual(resolved.fixedScoring, { win: 2, loss: 0, draw: 1 });
    assert.equal(resolved.bestOf, 3);
    // Non réglés : ceux du format livré.
    assert.equal(resolved.swissPairing, "ranked");
    assert.equal(resolved.requireMatchStats, true);
  });

  it("écarte un départage que le preset retenu ne relève pas", () => {
    // Chaîne réglée sous un autre format : la statistique étrangère ne se
    // calcule pas, et une règle affichée qui ne compare que des zéros vaut
    // moins que pas de règle du tout.
    const resolved = resolveGameTournamentDefaults("w40k", {
      statsPresetKey: "victory-points",
      tiebreakers: ["stat:battlePoints", "omw"],
    });
    assert.deepEqual(resolved.tiebreakers, ["omw"]);
  });

  it("respecte une chaîne vidée par l'administration", () => {
    const resolved = resolveGameTournamentDefaults("w40k", { tiebreakers: [] });
    assert.deepEqual(resolved.tiebreakers, []);
  });

  it("porte le catalogue de scénarios tel qu'il est réglé", () => {
    const scenarios = [{ id: "s1", name: "Conflit mineur", description: "Une seule escouade" }];
    assert.deepEqual(resolveGameTournamentDefaults("w40k", { scenarios }).scenarios, scenarios);
  });

  describe("presetOptionsForGame", () => {
    it("propose les formats déclarés pour le jeu", () => {
      const keys = presetOptionsForGame("w40k", undefined).map((preset) => preset.key);
      assert.deepEqual(keys, ["battle-points", "victory-points"]);
    });

    it("ajoute le format réglé par l'administration s'il vient d'ailleurs", () => {
      // Sans cette réunion, un format réglé en administration s'appliquerait aux
      // phases sans jamais apparaître dans leur formulaire.
      const keys = presetOptionsForGame("w40k", { statsPresetKey: "blood-bowl" }).map(
        (preset) => preset.key
      );
      assert.deepEqual(keys, ["blood-bowl", "battle-points", "victory-points"]);
    });

    it("ne propose rien pour un jeu sans format livré", () => {
      assert.deepEqual(presetOptionsForGame("riftbound", undefined), []);
    });
  });
});
