import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import { displayPlan, grantsEntitlement, isActive, resolveEntitlements, seatsFor } from "./entitlements";

/**
 * Le calcul des droits à partir des plans portés par un compte.
 *
 * Deux choses valent d'être verrouillées : un compte sans plan n'obtient rien
 * (c'est toute la mécanique de fin d'abonnement), et une valeur inconnue venue
 * de la base n'accorde jamais rien non plus.
 *
 * Exécution : `npm run test`.
 */

describe("resolveEntitlements", () => {
  it("n'accorde rien sans plan", () => {
    assert.deepEqual(resolveEntitlements([]), []);
  });

  it("accorde les droits du plan porté", () => {
    assert.ok(resolveEntitlements(["expert"]).includes("sub:profile-border"));
  });

  it("fond les droits communs à deux plans sans les doubler", () => {
    const droits = resolveEntitlements(["expert", "pro"]);

    assert.equal(new Set(droits).size, droits.length);
    // « sub:profile-badge » est déclaré par les deux offres.
    assert.equal(droits.filter((droit) => droit === "sub:profile-badge").length, 1);
  });

  it("réunit les droits des deux offres", () => {
    const droits = resolveEntitlements(["expert", "pro"]);

    assert.ok(droits.includes("sub:profile-border"));
    assert.ok(droits.includes("sub:lair-pro"));
  });

  it("ignore un plan inconnu venu de la base", () => {
    // Un document écrit par une version antérieure, ou modifié à la main, ne
    // doit pas ouvrir de droits par accident.
    const droits = resolveEntitlements(["gold" as SubscriptionPlanKey]);

    assert.deepEqual(droits, []);
  });

  it("rend une réponse même si la table se référençait en cycle", () => {
    // Garde-fou : la traversée de `includes` mémorise les plans déjà vus. Si
    // ce test se met à expirer, c'est que la protection a sauté.
    assert.ok(Array.isArray(resolveEntitlements(["expert", "pro", "expert"])));
  });
});

describe("grantsEntitlement", () => {
  it("refuse un droit que le plan n'ouvre pas", () => {
    assert.equal(grantsEntitlement(["expert"], "sub:lair-pro"), false);
  });

  it("accorde un droit que le plan ouvre", () => {
    assert.equal(grantsEntitlement(["pro"], "sub:lair-pro"), true);
  });

  it("ne refuse rien à moitié quand la liste est vide", () => {
    assert.equal(grantsEntitlement([], "sub:profile-badge"), false);
  });
});

describe("seatsFor", () => {
  it("ne donne aucun siège sans plan", () => {
    assert.equal(seatsFor([]), 0);
  });

  it("ne donne aucun siège à la seule offre joueur", () => {
    assert.equal(seatsFor(["expert"]), 0);
  });

  it("prend le maximum plutôt que la somme", () => {
    // Cumuler les deux offres n'offre pas plus de sièges que l'offre
    // organisateur seule.
    assert.equal(seatsFor(["expert", "pro"]), seatsFor(["pro"]));
  });
});

describe("displayPlan", () => {
  it("ne montre rien sans plan", () => {
    assert.equal(displayPlan([]), null);
  });

  it("montre le dernier plan de l'ordre de la table", () => {
    assert.equal(displayPlan(["expert", "pro"]), "pro");
    assert.equal(displayPlan(["pro", "expert"]), "pro");
  });

  it("ignore un plan inconnu", () => {
    assert.equal(displayPlan(["gold" as SubscriptionPlanKey, "expert"]), "expert");
    assert.equal(displayPlan(["gold" as SubscriptionPlanKey]), null);
  });
});

describe("isActive", () => {
  it("est faux sans plan — c'est toute la mécanique de fin d'abonnement", () => {
    assert.equal(isActive([]), false);
  });

  it("est vrai dès qu'un plan connu est porté", () => {
    assert.equal(isActive(["expert"]), true);
  });

  it("est faux si le seul plan porté est inconnu", () => {
    assert.equal(isActive(["gold" as SubscriptionPlanKey]), false);
  });
});
