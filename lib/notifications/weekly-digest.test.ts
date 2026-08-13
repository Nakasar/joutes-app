import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { weeklyDigestFilter, weeklyDigestPush } from "./weekly-digest";

/**
 * Tests du récapitulatif hebdomadaire.
 *
 * Le point sensible est la mémoire d'envoi : chaque canal a la sienne, sans
 * quoi recevoir le courriel priverait du push, et inversement.
 *
 * Exécution : `npm run test`.
 */

describe("weeklyDigestFilter", () => {
  it("chaque canal a sa propre mémoire d'envoi", () => {
    const courriel = weeklyDigestFilter("emails", "2026-08-07T00:00:00Z");
    const application = weeklyDigestFilter("app", "2026-08-07T00:00:00Z");

    assert.ok("notifications.emails.weekly.enabled" in courriel);
    assert.ok("notifications.app.weekly.enabled" in application);
    assert.ok(!("notifications.app.weekly.enabled" in courriel));
  });

  it("laisse passer qui n'a jamais rien reçu", () => {
    const filtre = weeklyDigestFilter("app", "2026-08-07T00:00:00Z");

    assert.deepEqual(filtre.$or, [
      { "notifications.app.weekly.lastSent": { $lte: "2026-08-07T00:00:00Z" } },
      { "notifications.app.weekly.lastSent": { $exists: false } },
      { "notifications.app.weekly.lastSent": null },
    ]);
  });
});

describe("weeklyDigestPush", () => {
  it("ne dit rien quand il n'y a rien à dire", () => {
    // Une notification « rien cette semaine » est le meilleur moyen de se
    // faire couper les notifications.
    assert.equal(weeklyDigestPush([]), null);
  });

  it("nomme l'événement quand il est seul", () => {
    assert.deepEqual(weeklyDigestPush([{ name: "Tournoi du samedi" }]), {
      title: "Un événement cette semaine",
      body: "Tournoi du samedi",
    });
  });

  it("nomme les trois premiers et compte le reste", () => {
    const digest = weeklyDigestPush([
      { name: "Un" },
      { name: "Deux" },
      { name: "Trois" },
      { name: "Quatre" },
      { name: "Cinq" },
    ]);

    assert.equal(digest?.title, "5 événements cette semaine");
    assert.equal(digest?.body, "Un, Deux, Trois et 2 autres");
  });

  it("accorde le pluriel du reste", () => {
    const digest = weeklyDigestPush([
      { name: "Un" },
      { name: "Deux" },
      { name: "Trois" },
      { name: "Quatre" },
    ]);

    assert.equal(digest?.body, "Un, Deux, Trois et 1 autre");
  });
});
