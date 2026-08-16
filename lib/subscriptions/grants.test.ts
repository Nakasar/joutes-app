import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import type { GrantedPlan } from "@/lib/types/Subscription";
import { displayPlan, resolveEntitlements } from "./entitlements";
import { effectivePlans, grantedPlanKeys, planOrigin } from "./grants";

/**
 * La composition des paliers payés et offerts.
 *
 * C'est ici que se prouve le nœud de la fonctionnalité : un palier offert ouvre
 * exactement les mêmes droits qu'un palier payé, et il survit à une
 * synchronisation Patreon qui vide `plans`. Les deux assertions correspondantes
 * sont signalées dans les tests.
 *
 * Exécution : `npm run test`.
 */

function octroi(plan: SubscriptionPlanKey): GrantedPlan {
  return {
    plan,
    grantedAt: new Date("2026-01-01T00:00:00Z"),
    grantedBy: "admin-1",
    reason: "boutique partenaire",
  };
}

describe("grantedPlanKeys", () => {
  it("extrait les clés des octrois", () => {
    assert.deepEqual(grantedPlanKeys([octroi("pro"), octroi("supporter")]), ["pro", "supporter"]);
  });

  it("ignore un octroi dont le palier est inconnu", () => {
    // Un document écrit par une version antérieure, ou modifié à la main.
    const inconnu = { ...octroi("pro"), plan: "gold" as SubscriptionPlanKey };

    assert.deepEqual(grantedPlanKeys([inconnu]), []);
  });

  it("survit à un tableau vide ou à une entrée abîmée", () => {
    assert.deepEqual(grantedPlanKeys([]), []);
    assert.deepEqual(grantedPlanKeys([undefined as unknown as GrantedPlan]), []);
  });
});

describe("effectivePlans", () => {
  it("n'accorde rien sans palier d'aucune sorte", () => {
    assert.deepEqual(effectivePlans({ paid: [], granted: [] }), []);
  });

  it("SURVIT À UNE SYNCHRONISATION QUI VIDE LES PALIERS PAYÉS", () => {
    // Le cas que toute la conception protège : le webhook réécrit `plans` en
    // bloc, `paid` devient vide, et le palier offert doit rester debout.
    assert.deepEqual(effectivePlans({ paid: [], granted: ["expert"] }), ["expert"]);
  });

  it("fond un palier tenu des deux côtés sans le doubler", () => {
    assert.deepEqual(effectivePlans({ paid: ["supporter"], granted: ["supporter"] }), ["supporter"]);
  });

  it("réunit un palier payé et un palier offert", () => {
    assert.deepEqual(effectivePlans({ paid: ["supporter"], granted: ["pro"] }), ["supporter", "pro"]);
  });

  it("rend toujours l'ordre de la table, quel que soit l'ordre d'arrivée", () => {
    // Sinon le badge changerait selon que le palier a été offert avant ou après
    // l'abonnement, alors que le compte est dans le même état.
    const a = effectivePlans({ paid: ["pro"], granted: ["supporter"] });
    const b = effectivePlans({ paid: ["supporter"], granted: ["pro"] });

    assert.deepEqual(a, b);
    assert.equal(displayPlan(a), displayPlan(b));
  });

  it("ignore un palier inconnu des deux côtés", () => {
    assert.deepEqual(
      effectivePlans({ paid: ["gold" as SubscriptionPlanKey], granted: ["gold" as SubscriptionPlanKey] }),
      []
    );
  });
});

describe("un palier offert ouvre les mêmes droits qu'un palier payé", () => {
  it("OUVRE LE SIÈGE DE LIEU SANS AUCUN PALIER PAYÉ", () => {
    // L'autre moitié du nœud : « mêmes droits » n'est vrai que si le calcul de
    // droits ne fait aucune différence entre les deux origines.
    const plans = effectivePlans({ paid: [], granted: ["pro"] });

    assert.ok(resolveEntitlements(plans).includes("sub:lair-pro"));
  });

  it("donne exactement les mêmes droits que le même palier payé", () => {
    assert.deepEqual(
      resolveEntitlements(effectivePlans({ paid: [], granted: ["expert"] })),
      resolveEntitlements(effectivePlans({ paid: ["expert"], granted: [] }))
    );
  });
});

describe("planOrigin", () => {
  it("distingue les trois origines", () => {
    const detenu = { paid: ["supporter"] as SubscriptionPlanKey[], granted: ["pro"] as SubscriptionPlanKey[] };

    assert.equal(planOrigin(detenu, "supporter"), "paid");
    assert.equal(planOrigin(detenu, "pro"), "granted");
  });

  it("signale un palier tenu des deux côtés", () => {
    assert.equal(planOrigin({ paid: ["pro"], granted: ["pro"] }, "pro"), "both");
  });

  it("rend null pour un palier non détenu", () => {
    assert.equal(planOrigin({ paid: [], granted: [] }, "expert"), null);
  });
});
