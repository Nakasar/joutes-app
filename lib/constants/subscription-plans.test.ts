import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_ENTITLEMENTS,
  ENTITLEMENT_PREFIX,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLAN_KEYS,
  isEntitlementKey,
  isSubscriptionPlanKey,
} from "./subscription-plans";
import { resolveEntitlements } from "@/lib/subscriptions/entitlements";

/**
 * La table des abonnements est une déclaration, pas du code : ces tests
 * vérifient ses invariants plutôt qu'un comportement. Ce qui compte, c'est
 * qu'une modification de la table ne puisse pas créer en silence un droit qui
 * marche sur les plates-bandes des permissions accordées à la main.
 *
 * Exécution : `npm run test`.
 */

// Les permissions posées à la main dans `user.permissions[]`, telles qu'on les
// trouve aujourd'hui dans le code. Elles ne doivent jamais croiser un droit
// d'abonnement : la même chaîne dans les deux systèmes, et une rétrogradation
// Patreon retirerait un droit de modération.
const PERMISSIONS_ACCORDEES_A_LA_MAIN = [
  "scanner:ai",
  "quizzes:ai-import",
  "quizzes:update-all",
  "quizzes:update",
  "erratas:manage",
  "erratas:update",
  "erratas:vote",
  "policies:update",
  "policies:vote",
  "news:update",
];

describe("table des abonnements", () => {
  it("préfixe tous les droits par « sub: »", () => {
    for (const entitlement of ALL_ENTITLEMENTS) {
      assert.ok(
        entitlement.startsWith(ENTITLEMENT_PREFIX),
        `${entitlement} devrait commencer par ${ENTITLEMENT_PREFIX}`
      );
    }
  });

  it("n'entre en collision avec aucune permission accordée à la main", () => {
    for (const entitlement of ALL_ENTITLEMENTS) {
      assert.ok(
        !PERMISSIONS_ACCORDEES_A_LA_MAIN.includes(entitlement),
        `${entitlement} existe déjà comme permission`
      );
    }
  });

  it("ne déclare aucun droit en double", () => {
    assert.equal(new Set(ALL_ENTITLEMENTS).size, ALL_ENTITLEMENTS.length);
  });

  it("n'ouvre de siège de lieu qu'à l'offre organisateur", () => {
    assert.equal(SUBSCRIPTION_PLANS.supporter.lairSeats, 0);
    assert.equal(SUBSCRIPTION_PLANS.expert.lairSeats, 0);
    assert.ok(SUBSCRIPTION_PLANS.pro.lairSeats >= 1);
  });

  it("classe les paliers du moins cher au plus cher", () => {
    // L'ordre de la table est celui de la page d'offres, et sert de départage
    // à `displayPlan`. Un palier moins cher placé après un plus cher ferait
    // afficher « Supporter » à un abonné Pro.
    const montants = SUBSCRIPTION_PLAN_KEYS.map((key) => SUBSCRIPTION_PLANS[key].monthlyCents);

    assert.deepEqual(montants, [...montants].sort((a, b) => a - b));
  });

  it("donne une teinte distincte à chaque palier", () => {
    const teintes = SUBSCRIPTION_PLAN_KEYS.map((key) => SUBSCRIPTION_PLANS[key].tone);

    assert.equal(new Set(teintes).size, teintes.length);
  });

  it("accorde la cosmétique à tous les paliers payants", () => {
    // Supporter est le palier d'entrée : personne qui paie davantage ne doit se
    // retrouver privé de ce qu'il offre.
    for (const key of SUBSCRIPTION_PLAN_KEYS) {
      assert.ok(
        resolveEntitlements([key]).includes("sub:profile-badge"),
        `${key} devrait ouvrir le badge de profil`
      );
    }
  });

  it("ne fait pas de Pro un sur-ensemble d'Expert", () => {
    // Deux publics, pas une échelle : une boutique ne paie pas pour les outils
    // de joueur. Si ce test tombe, c'est que la décision produit a changé — et
    // elle doit alors changer explicitement, pas par accident.
    assert.deepEqual(SUBSCRIPTION_PLANS.pro.includes, ["supporter"]);
    assert.deepEqual(SUBSCRIPTION_PLANS.expert.includes, ["supporter"]);
  });

  it("ne référence dans « includes » que des plans existants", () => {
    for (const key of SUBSCRIPTION_PLAN_KEYS) {
      for (const included of SUBSCRIPTION_PLANS[key].includes) {
        assert.ok(isSubscriptionPlanKey(included), `${key} inclut un plan inconnu : ${included}`);
      }
    }
  });
});

describe("gardes-types", () => {
  it("reconnaît les plans déclarés", () => {
    assert.equal(isSubscriptionPlanKey("supporter"), true);
    assert.equal(isSubscriptionPlanKey("expert"), true);
    assert.equal(isSubscriptionPlanKey("pro"), true);
  });

  it("refuse un plan inconnu", () => {
    assert.equal(isSubscriptionPlanKey("gold"), false);
  });

  it("refuse une propriété héritée du prototype", () => {
    // `in` remonterait la chaîne de prototypes et ferait passer « toString »
    // pour un plan : c'est exactement ce que `Object.hasOwn` évite.
    assert.equal(isSubscriptionPlanKey("toString"), false);
    assert.equal(isSubscriptionPlanKey("constructor"), false);
    assert.equal(isSubscriptionPlanKey("__proto__"), false);
  });

  it("reconnaît les droits déclarés et refuse les autres", () => {
    assert.equal(isEntitlementKey("sub:profile-badge"), true);
    assert.equal(isEntitlementKey("sub:inexistant"), false);
    assert.equal(isEntitlementKey("scanner:ai"), false);
    assert.equal(isEntitlementKey("toString"), false);
  });
});
