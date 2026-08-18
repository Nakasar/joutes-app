import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAttachPro, remainingSeats, type Seat } from "./seats";
import { effectivePlans } from "./grants";

/**
 * Les règles de rattachement d'un lieu à un abonnement Pro.
 *
 * Chaque refus porte un motif distinct : l'écran de gestion en tire son message,
 * et un motif qui se confondrait avec un autre donnerait une explication fausse
 * à un propriétaire de lieu qui ne comprend déjà pas pourquoi ça bloque.
 *
 * Exécution : `npm run test`.
 */

const LIEU = { id: "lair-1" };
const LIEU_PRIVE = { id: "lair-2", isPrivate: true };

function siege(lairId: string): Seat {
  return { lairId, attachedAt: new Date("2026-01-01T00:00:00Z"), attachedBy: "user-1" };
}

describe("canAttachPro", () => {
  it("accepte le cas nominal", () => {
    assert.deepEqual(canAttachPro({ plans: ["pro"], seats: [], lair: LIEU }), { ok: true });
  });

  it("refuse un compte sans abonnement", () => {
    assert.deepEqual(canAttachPro({ plans: [], seats: [], lair: LIEU }), {
      ok: false,
      reason: "not-pro",
    });
  });

  it("refuse l'offre joueur, qui n'ouvre aucun siège", () => {
    assert.deepEqual(canAttachPro({ plans: ["expert"], seats: [], lair: LIEU }), {
      ok: false,
      reason: "not-pro",
    });
  });

  it("refuse un lieu privé", () => {
    // Même logique que le schéma des lieux, qui refuse déjà bannière et sources
    // d'évènements aux lieux privés : les fonctionnalités Pro sont des
    // fonctionnalités de vitrine publique.
    assert.deepEqual(canAttachPro({ plans: ["pro"], seats: [], lair: LIEU_PRIVE }), {
      ok: false,
      reason: "private-lair",
    });
  });

  it("refuse un lieu déjà rattaché", () => {
    assert.deepEqual(canAttachPro({ plans: ["pro"], seats: [siege("lair-1")], lair: LIEU }), {
      ok: false,
      reason: "already-attached",
    });
  });

  it("refuse quand les sièges sont pleins", () => {
    assert.deepEqual(canAttachPro({ plans: ["pro"], seats: [siege("autre")], lair: LIEU }), {
      ok: false,
      reason: "seats-full",
    });
  });

  it("annonce « déjà rattaché » plutôt que « sièges pleins » sur un lieu déjà pris", () => {
    // Les deux conditions sont vraies en même temps quand le seul siège porte
    // déjà ce lieu. Le message utile est celui qui explique la situation, pas
    // celui qui invite à libérer un siège qu'on occupe soi-même.
    const check = canAttachPro({ plans: ["pro"], seats: [siege("lair-1")], lair: LIEU });

    assert.deepEqual(check, { ok: false, reason: "already-attached" });
  });

  it("refuse d'abord pour absence d'abonnement, avant toute autre raison", () => {
    // Un compte sans Pro qui vise un lieu privé déjà rattaché doit s'entendre
    // dire qu'il n'est pas abonné : c'est la seule chose qu'il peut corriger.
    const check = canAttachPro({
      plans: [],
      seats: [siege("lair-2")],
      lair: LIEU_PRIVE,
    });

    assert.deepEqual(check, { ok: false, reason: "not-pro" });
  });
});

describe("remainingSeats", () => {
  it("compte les sièges libres", () => {
    assert.equal(remainingSeats({ plans: ["pro"], seats: [] }), 1);
  });

  it("tombe à zéro quand tout est pris", () => {
    assert.equal(remainingSeats({ plans: ["pro"], seats: [siege("lair-1")] }), 0);
  });

  it("ne descend jamais sous zéro après une rétrogradation", () => {
    // L'abonnement s'est éteint mais les sièges restent : ils enregistrent une
    // intention, pas un droit. L'écran doit afficher « 0 », pas « -1 ».
    assert.equal(remainingSeats({ plans: [], seats: [siege("lair-1")] }), 0);
  });
});

describe("un palier offert rattache comme un palier payé", () => {
  /**
   * Le rattachement d'un lieu se calculait sur `subscription.plans`, la seule
   * part venue de Patreon : un Pro offert par l'équipe vit dans `grantedPlans`,
   * et l'écran répondait « il faut un abonnement Joutes Pro » à quelqu'un qui en
   * avait un. Ces deux assertions fixent l'invariant que le correctif rétablit —
   * elles portent sur la composition, seul maillon testable sans base.
   */
  it("ouvre un siège", () => {
    const plans = effectivePlans({ paid: [], granted: ["pro"] });

    assert.deepEqual(canAttachPro({ plans, seats: [], lair: { id: "lair-1" } }), { ok: true });
    assert.equal(remainingSeats({ plans, seats: [] }), 1);
  });

  it("n'en ouvre toujours aucun sans Pro", () => {
    const plans = effectivePlans({ paid: [], granted: ["expert"] });

    assert.deepEqual(canAttachPro({ plans, seats: [], lair: { id: "lair-1" } }), {
      ok: false,
      reason: "not-pro",
    });
  });
});
