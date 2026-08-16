import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  identityActivePatron,
  identityDeclinedButEntitled,
  identityFormerPatron,
  identityNoMembership,
  memberActivePatron,
} from "./__fixtures__/identity";
import { plansFromSnapshot, resolveMembership, type PatreonPlanMapping } from "./resolve";
import type { MembershipSnapshot } from "./types";

/**
 * Démêlage des charges utiles Patreon et résolution en plans.
 *
 * Deux familles de risque sont couvertes ici. D'abord la lecture : une réponse
 * inattendue doit rendre `null` sans jeter, jamais un instantané vide qui
 * passerait pour « cet abonné n'a plus rien ». Ensuite la règle : c'est elle qui
 * décide qui paie et qui a des droits, et elle doit être vraie avant même que la
 * campagne Patreon n'existe.
 *
 * Exécution : `npm run test`.
 */

const MAPPING_PAR_PALIER: PatreonPlanMapping = {
  expert: { tierIds: ["tier-expert"], minCents: 300 },
  pro: { tierIds: ["tier-pro"], minCents: 1000 },
};

// Ce que le mapping vaut tant que la campagne n'existe pas : aucun identifiant
// de palier connu, donc repli sur le montant.
const MAPPING_PAR_MONTANT: PatreonPlanMapping = {
  expert: { tierIds: [], minCents: 300 },
  pro: { tierIds: [], minCents: 1000 },
};

function snapshot(overrides: Partial<MembershipSnapshot> = {}): MembershipSnapshot {
  return {
    patreonUserId: "patreon-user-1",
    memberId: "member-1",
    entitledTierIds: [],
    entitledAmountCents: 0,
    patronStatus: "active_patron",
    lastChargeStatus: "Paid",
    ...overrides,
  };
}

describe("resolveMembership", () => {
  it("lit une réponse /identity avec adhésion", () => {
    const result = resolveMembership(identityActivePatron);

    assert.deepEqual(result, {
      patreonUserId: "patreon-user-1",
      memberId: "member-1",
      entitledTierIds: ["tier-pro"],
      entitledAmountCents: 1000,
      patronStatus: "active_patron",
      lastChargeStatus: "Paid",
    });
  });

  it("lit une réponse /members/{id}, où le membre est à la racine", () => {
    const result = resolveMembership(memberActivePatron);

    assert.equal(result?.memberId, "member-1");
    assert.equal(result?.patreonUserId, "patreon-user-1");
    assert.deepEqual(result?.entitledTierIds, ["tier-pro"]);
  });

  it("rend un instantané vide, et non null, pour un compte lié sans adhésion", () => {
    // C'est une réponse parfaitement valide — c'est même celle qu'on obtiendra
    // tant que la campagne n'existe pas. Elle signifie « aucun palier », ce qui
    // n'est pas la même chose que « je n'ai pas su lire ».
    const result = resolveMembership(identityNoMembership);

    assert.equal(result?.patreonUserId, "patreon-user-2");
    assert.deepEqual(result?.entitledTierIds, []);
  });

  it("conserve le montant historique d'un ancien mécène sans palier", () => {
    const result = resolveMembership(identityFormerPatron);

    assert.equal(result?.patronStatus, "former_patron");
    assert.deepEqual(result?.entitledTierIds, []);
    assert.equal(result?.entitledAmountCents, 1000);
  });

  it("rend null sur une charge utile illisible, sans jeter", () => {
    // `null` veut dire « je n'ai pas su lire », et l'appelant ne doit surtout
    // pas en conclure une extinction d'abonnement.
    assert.equal(resolveMembership(null), null);
    assert.equal(resolveMembership(undefined), null);
    assert.equal(resolveMembership({}), null);
    assert.equal(resolveMembership({ data: null }), null);
    assert.equal(resolveMembership({ data: [] }), null);
    assert.equal(resolveMembership({ data: { id: "x", type: "campaign" } }), null);
  });

  it("survit à un « included » absent ou à des relations manquantes", () => {
    const result = resolveMembership({
      data: { id: "member-9", type: "member", attributes: {} },
    });

    assert.equal(result?.memberId, "member-9");
    assert.deepEqual(result?.entitledTierIds, []);
    assert.equal(result?.entitledAmountCents, 0);
    assert.equal(result?.patronStatus, null);
  });

  it("ignore un statut de mécène inconnu plutôt que de le recopier", () => {
    const result = resolveMembership({
      data: {
        id: "member-9",
        type: "member",
        attributes: { patron_status: "something_new", currently_entitled_amount_cents: "1000" },
      },
    });

    assert.equal(result?.patronStatus, null);
    // Un montant qui n'est pas un nombre vaut zéro, il ne fait pas planter.
    assert.equal(result?.entitledAmountCents, 0);
  });
});

describe("plansFromSnapshot — mapping par identifiant de palier", () => {
  it("reconnaît le palier configuré", () => {
    const plans = plansFromSnapshot(snapshot({ entitledTierIds: ["tier-pro"] }), MAPPING_PAR_PALIER);

    assert.deepEqual(plans, ["pro"]);
  });

  it("ignore le montant quand un identifiant est configuré", () => {
    // Un mécène généreux sur un palier qui n'est pas le nôtre n'hérite pas du
    // plan par la bande.
    const plans = plansFromSnapshot(
      snapshot({ entitledTierIds: ["tier-autre"], entitledAmountCents: 5000 }),
      MAPPING_PAR_PALIER
    );

    assert.deepEqual(plans, []);
  });

  it("rend les deux plans quand les deux paliers sont actifs", () => {
    const plans = plansFromSnapshot(
      snapshot({ entitledTierIds: ["tier-expert", "tier-pro"] }),
      MAPPING_PAR_PALIER
    );

    assert.deepEqual(plans, ["expert", "pro"]);
  });
});

describe("plansFromSnapshot — repli par montant, campagne inexistante", () => {
  it("ouvre le plan dont le seuil est atteint", () => {
    const plans = plansFromSnapshot(
      snapshot({ entitledTierIds: ["tier-quelconque"], entitledAmountCents: 300 }),
      MAPPING_PAR_MONTANT
    );

    assert.deepEqual(plans, ["expert"]);
  });

  it("ouvre les deux plans quand le montant dépasse les deux seuils", () => {
    const plans = plansFromSnapshot(
      snapshot({ entitledTierIds: ["tier-quelconque"], entitledAmountCents: 1000 }),
      MAPPING_PAR_MONTANT
    );

    assert.deepEqual(plans, ["expert", "pro"]);
  });

  it("n'ouvre rien sur un montant sans palier actif", () => {
    // Le piège de l'ancien mécène : le montant historique reste sur la fiche
    // alors que plus aucun palier n'est actif.
    const plans = plansFromSnapshot(
      snapshot({ entitledTierIds: [], entitledAmountCents: 5000, patronStatus: "former_patron" }),
      MAPPING_PAR_MONTANT
    );

    assert.deepEqual(plans, []);
  });
});

describe("plansFromSnapshot — le statut ne conditionne jamais le droit", () => {
  it("garde le droit d'un paiement refusé encore dans sa période payée", () => {
    // C'est Patreon qui décide de la fin de période via
    // `currently_entitled_tiers` ; on ne recalcule rien.
    const membership = resolveMembership(identityDeclinedButEntitled)!;

    assert.equal(membership.patronStatus, "declined_patron");
    assert.deepEqual(plansFromSnapshot(membership, MAPPING_PAR_PALIER), ["expert"]);
  });

  it("retire le droit quand Patreon a retiré le palier", () => {
    const membership = resolveMembership(identityFormerPatron)!;

    assert.deepEqual(plansFromSnapshot(membership, MAPPING_PAR_PALIER), []);
  });
});
