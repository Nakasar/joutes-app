import type { PatreonDocument } from "../types";

/**
 * Charges utiles Patreon enregistrées, pour tester le démêlage sans réseau.
 *
 * Ce dossier ne correspond pas au motif `lib/**\/*.test.ts` du lanceur de tests :
 * ces modules sont importés, jamais exécutés comme suite.
 *
 * Les formes reproduisent la réponse de
 * `/identity?include=memberships.currently_entitled_tiers,memberships.campaign`
 * et celle de `/members/{id}`, réduites aux champs qu'on demande.
 */

/** Mécène actif, un palier, réponse `/identity`. */
export const identityActivePatron: PatreonDocument = {
  data: {
    id: "patreon-user-1",
    type: "user",
    attributes: { full_name: "Alex", email: "alex@example.test" },
    relationships: {
      memberships: { data: [{ id: "member-1", type: "member" }] },
    },
  },
  included: [
    {
      id: "member-1",
      type: "member",
      attributes: {
        patron_status: "active_patron",
        currently_entitled_amount_cents: 1000,
        last_charge_status: "Paid",
      },
      relationships: {
        currently_entitled_tiers: { data: [{ id: "tier-pro", type: "tier" }] },
        user: { data: { id: "patreon-user-1", type: "user" } },
      },
    },
    { id: "tier-pro", type: "tier", attributes: { title: "Joutes Pro", amount_cents: 1000 } },
  ],
};

/** Compte lié mais sans aucune adhésion à notre campagne. */
export const identityNoMembership: PatreonDocument = {
  data: {
    id: "patreon-user-2",
    type: "user",
    attributes: { full_name: "Sam" },
    relationships: { memberships: { data: [] } },
  },
  included: [],
};

/**
 * Ancien mécène : plus aucun palier, mais le montant historique traîne encore
 * sur la fiche. C'est le cas qui piège une règle fondée sur le seul montant.
 */
export const identityFormerPatron: PatreonDocument = {
  data: {
    id: "patreon-user-3",
    type: "user",
    relationships: { memberships: { data: [{ id: "member-3", type: "member" }] } },
  },
  included: [
    {
      id: "member-3",
      type: "member",
      attributes: {
        patron_status: "former_patron",
        currently_entitled_amount_cents: 1000,
        last_charge_status: "Paid",
      },
      relationships: { currently_entitled_tiers: { data: [] } },
    },
  ],
};

/**
 * Paiement refusé, mais toujours dans la période payée : Patreon conserve les
 * paliers, donc le droit reste ouvert. C'est la décision produit « on suit
 * `currently_entitled_tiers` » rendue mécanique.
 */
export const identityDeclinedButEntitled: PatreonDocument = {
  data: {
    id: "patreon-user-4",
    type: "user",
    relationships: { memberships: { data: [{ id: "member-4", type: "member" }] } },
  },
  included: [
    {
      id: "member-4",
      type: "member",
      attributes: {
        patron_status: "declined_patron",
        currently_entitled_amount_cents: 300,
        last_charge_status: "Declined",
      },
      relationships: {
        currently_entitled_tiers: { data: [{ id: "tier-expert", type: "tier" }] },
      },
    },
  ],
};

/** Réponse `/members/{id}` : la ressource `member` est à la racine. */
export const memberActivePatron: PatreonDocument = {
  data: {
    id: "member-1",
    type: "member",
    attributes: {
      patron_status: "active_patron",
      currently_entitled_amount_cents: 1000,
      last_charge_status: "Paid",
    },
    relationships: {
      currently_entitled_tiers: { data: [{ id: "tier-pro", type: "tier" }] },
      user: { data: { id: "patreon-user-1", type: "user" } },
    },
  },
  included: [{ id: "tier-pro", type: "tier", attributes: { title: "Joutes Pro" } }],
};

/** Charge utile d'un webhook `members:update`, telle que Patreon la poste. */
export const webhookMembersUpdate = {
  data: {
    id: "member-1",
    type: "member",
    attributes: {
      patron_status: "active_patron",
      currently_entitled_amount_cents: 1000,
      last_charge_status: "Paid",
    },
    relationships: {
      currently_entitled_tiers: { data: [{ id: "tier-pro", type: "tier" }] },
      user: { data: { id: "patreon-user-1", type: "user" } },
    },
  },
  included: [{ id: "tier-pro", type: "tier", attributes: { title: "Joutes Pro" } }],
};
