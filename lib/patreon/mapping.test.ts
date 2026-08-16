import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_PLAN_KEYS } from "@/lib/constants/subscription-plans";
import { minCentsEnvName, readForcedPlans, readPlanMapping, tierEnvName } from "./mapping";

/**
 * Lecture de la configuration Patreon depuis l'environnement.
 *
 * Le cas qui compte le plus est celui d'aujourd'hui : aucune campagne, donc
 * aucun identifiant de palier, et un mapping qui doit malgré tout être
 * exploitable grâce aux seuils de montant.
 *
 * Exécution : `npm run test`.
 */

describe("noms de variables", () => {
  it("les dérive des clés de la table des plans", () => {
    assert.equal(tierEnvName("expert"), "PATREON_TIER_EXPERT");
    assert.equal(minCentsEnvName("pro"), "PATREON_MIN_CENTS_PRO");
  });
});

describe("readPlanMapping", () => {
  it("couvre exactement les plans déclarés", () => {
    // Ajouter une offre à la table doit suffire : personne ne doit avoir à
    // penser à l'inscrire ici.
    assert.deepEqual(Object.keys(readPlanMapping({})).sort(), [...SUBSCRIPTION_PLAN_KEYS].sort());
  });

  it("sans campagne, laisse les paliers vides et retombe sur les montants de la table", () => {
    const mapping = readPlanMapping({});

    assert.deepEqual(mapping.expert.tierIds, []);
    assert.deepEqual(mapping.pro.tierIds, []);
    assert.equal(mapping.expert.minCents, SUBSCRIPTION_PLANS.expert.monthlyCents);
    assert.equal(mapping.pro.minCents, SUBSCRIPTION_PLANS.pro.monthlyCents);
  });

  it("traite une variable vide comme absente", () => {
    assert.deepEqual(readPlanMapping({ PATREON_TIER_PRO: "" }).pro.tierIds, []);
    assert.deepEqual(readPlanMapping({ PATREON_TIER_PRO: "   " }).pro.tierIds, []);
  });

  it("lit un identifiant de palier", () => {
    assert.deepEqual(readPlanMapping({ PATREON_TIER_PRO: "12345" }).pro.tierIds, ["12345"]);
  });

  it("accepte plusieurs paliers séparés par des virgules", () => {
    // Une offre annuelle et une offre mensuelle, ou un ancien palier conservé
    // pour les abonnés historiques, ouvrent le même plan.
    const mapping = readPlanMapping({ PATREON_TIER_PRO: "12345, 67890 ,, 111" });

    assert.deepEqual(mapping.pro.tierIds, ["12345", "67890", "111"]);
  });

  it("lit un seuil de montant explicite", () => {
    assert.equal(readPlanMapping({ PATREON_MIN_CENTS_EXPERT: "500" }).expert.minCents, 500);
  });

  it("retombe sur le montant de la table si le seuil est illisible", () => {
    for (const valeur of ["", "abc", "-1", undefined]) {
      assert.equal(
        readPlanMapping({ PATREON_MIN_CENTS_EXPERT: valeur }).expert.minCents,
        SUBSCRIPTION_PLANS.expert.monthlyCents,
        `valeur : ${String(valeur)}`
      );
    }
  });

  it("accepte un seuil à zéro, qui n'est pas la même chose qu'absent", () => {
    assert.equal(readPlanMapping({ PATREON_MIN_CENTS_EXPERT: "0" }).expert.minCents, 0);
  });
});

describe("readForcedPlans", () => {
  it("ne force rien par défaut", () => {
    assert.deepEqual(readForcedPlans({}), []);
  });

  it("lit les plans demandés pour un aperçu", () => {
    assert.deepEqual(readForcedPlans({ PATREON_DEV_FORCE_PLAN: "expert, pro" }), ["expert", "pro"]);
  });

  it("ignore un plan inconnu", () => {
    assert.deepEqual(readForcedPlans({ PATREON_DEV_FORCE_PLAN: "gold,expert" }), ["expert"]);
  });

  it("ne force jamais rien en production", () => {
    // Une variable oubliée en production offrirait sinon un abonnement à tous
    // les comptes connectés.
    assert.deepEqual(
      readForcedPlans({ PATREON_DEV_FORCE_PLAN: "expert,pro", NODE_ENV: "production" }),
      []
    );
  });
});
