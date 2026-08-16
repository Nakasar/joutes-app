import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUBSCRIPTION_PLAN_KEYS, SUBSCRIPTION_PLANS } from "@/lib/constants/subscription-plans";
import { appearanceForTone } from "@/lib/subscriptions/tone";
import type { AchievementWithUnlockInfo } from "@/lib/types/Achievement";
import { visibleStatuses } from "./status";
import { STATUS_TONE_KEYS, STATUS_TONES, isStatusTone, statusBadgeClass } from "./status-tone";

/**
 * Les statuts affichés à côté d'un pseudonyme.
 *
 * Deux choses valent d'être verrouillées : un succès ordinaire ne doit jamais se
 * retrouver en badge, et un statut ne doit jamais se déguiser en abonnement.
 *
 * Exécution : `npm run test`.
 */

function succes(overrides: Partial<AchievementWithUnlockInfo> = {}): AchievementWithUnlockInfo {
  return {
    id: "a1",
    name: "Fondateur",
    description: "",
    points: 0,
    ...overrides,
  };
}

describe("visibleStatuses", () => {
  it("ne retient rien sans succès", () => {
    assert.deepEqual(visibleStatuses([]), []);
  });

  it("ignore un succès ordinaire, même débloqué", () => {
    const ordinaire = succes({ unlockedAt: new Date("2026-01-01") });

    assert.deepEqual(visibleStatuses([ordinaire]), []);
  });

  it("ignore un statut non débloqué", () => {
    // Le catalogue contient tous les succès ; seuls ceux que la personne détient
    // doivent s'afficher.
    assert.deepEqual(visibleStatuses([succes({ isStatus: true })]), []);
  });

  it("retient un statut débloqué", () => {
    const statuts = visibleStatuses([
      succes({ isStatus: true, statusTone: "gold", unlockedAt: new Date("2026-01-01") }),
    ]);

    assert.equal(statuts.length, 1);
    assert.equal(statuts[0].name, "Fondateur");
    assert.equal(statuts[0].tone, "gold");
  });

  it("range du plus ancien au plus récent", () => {
    // « Fondateur » doit rester à gauche quand un statut s'ajoute des mois plus
    // tard : sinon la ligne de badges se réorganise sous les yeux de gens qui
    // n'ont rien demandé.
    const statuts = visibleStatuses([
      succes({ id: "b", name: "Ambassadeur", isStatus: true, unlockedAt: new Date("2026-06-01") }),
      succes({ id: "a", name: "Fondateur", isStatus: true, unlockedAt: new Date("2026-01-01") }),
    ]);

    assert.deepEqual(statuts.map((s) => s.name), ["Fondateur", "Ambassadeur"]);
  });

  it("plafonne le nombre de badges", () => {
    const beaucoup = Array.from({ length: 6 }, (_, i) =>
      succes({ id: `s${i}`, isStatus: true, unlockedAt: new Date(2026, i, 1) })
    );

    assert.equal(visibleStatuses(beaucoup).length, 3);
    assert.equal(visibleStatuses(beaucoup, 1).length, 1);
  });

  it("retombe sur la teinte neutre quand elle est inconnue", () => {
    const statuts = visibleStatuses([
      succes({ isStatus: true, statusTone: "fuchsia" as never, unlockedAt: new Date("2026-01-01") }),
    ]);

    assert.equal(statuts[0].tone, "slate");
  });
});

describe("teintes de statut", () => {
  it("donne des classes non vides et distinctes à chaque teinte", () => {
    const classes = STATUS_TONE_KEYS.map((tone) => STATUS_TONES[tone].badge);

    assert.equal(new Set(classes).size, classes.length);
    for (const classe of classes) {
      assert.ok(classe.length > 0);
    }
  });

  it("écrit les classes en toutes lettres", () => {
    // Tailwind lit le source : une classe composée n'existerait pas dans la
    // feuille finale.
    for (const tone of STATUS_TONE_KEYS) {
      assert.ok(!STATUS_TONES[tone].badge.includes("${"));
    }
  });

  it("ne se confond avec aucune teinte d'offre", () => {
    // Un « Fondateur » qui porterait les classes de Supporter se lirait comme un
    // abonnement, ce qui annulerait la distinction entre ce qui s'achète et ce
    // qui se mérite.
    const offres = new Set(
      SUBSCRIPTION_PLAN_KEYS.map((plan) => appearanceForTone(SUBSCRIPTION_PLANS[plan].tone).badge)
    );

    for (const tone of STATUS_TONE_KEYS) {
      assert.ok(!offres.has(STATUS_TONES[tone].badge), `${tone} porte les classes d'une offre`);
    }
  });

  it("refuse une teinte inconnue et une propriété du prototype", () => {
    assert.equal(isStatusTone("gold"), true);
    assert.equal(isStatusTone("fuchsia"), false);
    assert.equal(isStatusTone("toString"), false);
  });

  it("rend toujours des classes, même pour une teinte absente", () => {
    assert.equal(statusBadgeClass(undefined), STATUS_TONES.slate.badge);
    assert.equal(statusBadgeClass("inconnue"), STATUS_TONES.slate.badge);
    assert.equal(statusBadgeClass("gold"), STATUS_TONES.gold.badge);
  });
});
