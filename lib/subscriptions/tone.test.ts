import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_PLAN_KEYS } from "@/lib/constants/subscription-plans";
import { appearanceForPlan, appearanceForTone, labelForPlan } from "./tone";

/**
 * L'apparence des paliers.
 *
 * Le test qui compte est celui de la couverture : ajouter un palier avec une
 * teinte que la table d'apparences ignore rendrait `undefined`, et l'avatar
 * n'aurait plus d'anneau du tout — un défaut silencieux, visible seulement par
 * quelqu'un qui paie pour le voir.
 *
 * Exécution : `npm run test`.
 */

describe("appearanceForTone", () => {
  it("couvre toutes les teintes déclarées", () => {
    for (const key of SUBSCRIPTION_PLAN_KEYS) {
      const apparence = appearanceForTone(SUBSCRIPTION_PLANS[key].tone);

      assert.ok(apparence, `aucune apparence pour la teinte de ${key}`);
      assert.ok(apparence.ring.length > 0);
      assert.ok(apparence.badge.length > 0);
      assert.ok(apparence.gradient.length > 0);
    }
  });

  it("donne une apparence distincte à chaque palier", () => {
    const anneaux = SUBSCRIPTION_PLAN_KEYS.map((key) => appearanceForTone(SUBSCRIPTION_PLANS[key].tone).ring);

    assert.equal(new Set(anneaux).size, anneaux.length);
  });

  it("écrit les classes en toutes lettres", () => {
    // Tailwind lit le source pour décider quoi générer : une classe composée
    // par concaténation n'existerait pas dans la feuille finale. Le garde-fou
    // le plus simple est qu'aucune classe ne contienne d'interpolation.
    for (const key of SUBSCRIPTION_PLAN_KEYS) {
      const apparence = appearanceForTone(SUBSCRIPTION_PLANS[key].tone);

      for (const classe of [apparence.ring, apparence.badge, apparence.gradient]) {
        assert.ok(!classe.includes("${"), `classe interpolée : ${classe}`);
      }
    }
  });
});

describe("appearanceForPlan", () => {
  it("rend null sans plan", () => {
    assert.equal(appearanceForPlan(null), null);
  });

  it("rend null pour un plan inconnu", () => {
    // Un document écrit par une version antérieure ne doit pas faire planter un
    // rendu d'avatar.
    assert.equal(appearanceForPlan("gold" as never), null);
  });

  it("rend l'apparence du palier", () => {
    assert.deepEqual(appearanceForPlan("pro"), appearanceForTone(SUBSCRIPTION_PLANS.pro.tone));
  });

  it("ne se laisse pas abuser par une propriété du prototype", () => {
    assert.equal(appearanceForPlan("toString" as never), null);
    assert.equal(labelForPlan("constructor" as never), null);
  });
});

describe("labelForPlan", () => {
  it("reprend le libellé de la table", () => {
    assert.equal(labelForPlan("supporter"), "Supporter");
    assert.equal(labelForPlan("expert"), "Joutes Expert");
    assert.equal(labelForPlan("pro"), "Joutes Pro");
  });

  it("rend null sans plan", () => {
    assert.equal(labelForPlan(null), null);
  });
});
