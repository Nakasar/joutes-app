import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isNotificationPreference, isPushEnabledForUser } from "./preferences";

/**
 * Tests des réglages de notification.
 *
 * Le contrôle se faisait par deux appartenances indépendantes, ce qui acceptait
 * des couples qui n'existent nulle part. L'app mobile appelle désormais la même
 * action que le site : une matrice se vérifie mieux qu'elle ne se devine.
 *
 * Exécution : `npm run test`.
 */

describe("isNotificationPreference", () => {
  it("accepte les réglages qui existent", () => {
    assert.ok(isNotificationPreference("emails", "weekly"));
    assert.ok(isNotificationPreference("emails", "platform"));
    assert.ok(isNotificationPreference("app", "weekly"));
    assert.ok(isNotificationPreference("app", "push"));
  });

  it("refuse les couples que la validation par appartenance laissait passer", () => {
    // Un « courriel push » et un « récapitulatif plateforme sur l'app » n'ont
    // jamais existé, ni dans le type, ni dans l'interface.
    assert.ok(!isNotificationPreference("emails", "push"));
    assert.ok(!isNotificationPreference("app", "platform"));
  });

  it("refuse ce qui n'est pas un canal", () => {
    assert.ok(!isNotificationPreference("sms", "weekly"));
    assert.ok(!isNotificationPreference("__proto__", "weekly"));
    assert.ok(!isNotificationPreference("emails", "toString"));
  });
});

describe("isPushEnabledForUser", () => {
  it("absent vaut activé", () => {
    // Enregistrer un appareil pose le réglage : l'absence ne se rencontre que
    // sur les comptes qui n'ont jamais rien accepté, et qui n'ont donc aucun
    // appareil à qui écrire.
    assert.ok(isPushEnabledForUser(undefined));
    assert.ok(isPushEnabledForUser({}));
    assert.ok(isPushEnabledForUser({ app: {} }));
  });

  it("seul un refus explicite coupe", () => {
    assert.ok(!isPushEnabledForUser({ app: { push: { enabled: false } } }));
    assert.ok(isPushEnabledForUser({ app: { push: { enabled: true } } }));
  });
});
