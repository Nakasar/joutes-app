import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import { SUBSCRIPTION_PLAN_KEYS } from "@/lib/constants/subscription-plans";
import type {
  MembershipSnapshot,
  PatreonDocument,
  PatreonPatronStatus,
  PatreonResource,
  PatreonResourceIdentifier,
} from "./types";

/**
 * Le démêlage des charges utiles Patreon, et la résolution en plans.
 *
 * Tout ce qui connaît la forme JSON:API de Patreon vit ici, et nulle part
 * ailleurs. C'est la partie pénible — des relations qui pointent vers un tableau
 * `included` qu'il faut déréférencer à la main — et c'est précisément pour cela
 * qu'elle doit être testable sans réseau, sur des charges utiles enregistrées.
 *
 * Le module est pur : aucun accès base, aucun `fetch`, aucune variable
 * d'environnement lue directement (le mapping arrive en argument).
 */

const PATRON_STATUSES: PatreonPatronStatus[] = ["active_patron", "declined_patron", "former_patron"];

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function relationshipIds(resource: PatreonResource, name: string): string[] {
  return asArray(resource.relationships?.[name]?.data)
    .filter((identifier): identifier is PatreonResourceIdentifier => Boolean(identifier?.id))
    .map((identifier) => identifier.id);
}

function relationshipId(resource: PatreonResource, name: string): string | null {
  return relationshipIds(resource, name)[0] ?? null;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readPatronStatus(value: unknown): PatreonPatronStatus | null {
  return typeof value === "string" && (PATRON_STATUSES as string[]).includes(value)
    ? (value as PatreonPatronStatus)
    : null;
}

/**
 * L'adhésion décrite par une réponse `/identity` ou `/members/{id}`.
 *
 * Les deux formes sont acceptées parce que les deux chemins de synchronisation
 * les produisent : la liaison de compte lit `/identity` (le jeton du membre), le
 * webhook relit `/members/{id}` (le jeton du créateur). Elles ne diffèrent que
 * par l'endroit où se trouve la ressource `member` — à la racine, ou dans
 * `included` derrière la relation `memberships`.
 *
 * Rend `null` quand la charge utile n'est pas exploitable. **`null` ne veut pas
 * dire « aucun abonnement »** : il veut dire « je n'ai pas su lire », et
 * l'appelant ne doit surtout pas en conclure une extinction.
 */
export function resolveMembership(payload: PatreonDocument | null | undefined): MembershipSnapshot | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = asArray(payload.data)[0];
  if (!root?.type) {
    return null;
  }

  const included = payload.included ?? [];

  if (root.type === "member") {
    return snapshotFromMember(root, included, relationshipId(root, "user"));
  }

  if (root.type === "user") {
    // `/identity?include=memberships…` : la ressource racine est l'utilisateur,
    // et ses adhésions sont dans `included`. Sans le scope
    // `identity.memberships`, Patreon n'y met que l'adhésion à notre campagne —
    // c'est exactement ce qu'on veut, et la portée la moins intrusive.
    const membershipIds = relationshipIds(root, "memberships");
    const member = included.find(
      (resource) => resource.type === "member" && membershipIds.includes(resource.id)
    );

    if (!member) {
      // Compte lié, mais aucune adhésion à notre campagne : c'est une réponse
      // parfaitement valide, et elle signifie « aucun palier ».
      return {
        patreonUserId: root.id ?? null,
        memberId: null,
        entitledTierIds: [],
        entitledAmountCents: 0,
        patronStatus: null,
        lastChargeStatus: null,
      };
    }

    return snapshotFromMember(member, included, root.id ?? null);
  }

  return null;
}

function snapshotFromMember(
  member: PatreonResource,
  included: PatreonResource[],
  patreonUserId: string | null
): MembershipSnapshot {
  const attributes = member.attributes ?? {};
  const tierIds = relationshipIds(member, "currently_entitled_tiers");

  // Les paliers cités par la relation ne sont pas toujours tous détaillés dans
  // `included`. On garde les identifiants de la relation : ce sont eux qui font
  // foi, et les détails ne servent qu'à l'affichage.
  const knownTierIds = new Set(
    included.filter((resource) => resource.type === "tier").map((resource) => resource.id)
  );
  const orderedTierIds = [
    ...tierIds.filter((id) => knownTierIds.has(id)),
    ...tierIds.filter((id) => !knownTierIds.has(id)),
  ];

  return {
    patreonUserId: patreonUserId ?? relationshipId(member, "user"),
    memberId: member.id ?? null,
    entitledTierIds: orderedTierIds,
    entitledAmountCents: readNumber(attributes.currently_entitled_amount_cents),
    patronStatus: readPatronStatus(attributes.patron_status),
    lastChargeStatus:
      typeof attributes.last_charge_status === "string" ? attributes.last_charge_status : null,
  };
}

/** Ce qu'il faut savoir, par plan, pour reconnaître un palier Patreon. */
export type PatreonPlanMapping = Record<SubscriptionPlanKey, { tierIds: string[]; minCents: number }>;

/**
 * Les plans qu'ouvre une adhésion.
 *
 * La règle, dans l'ordre :
 *
 * 1. **Un identifiant de palier configuré fait autorité** pour son plan. Le
 *    seuil de montant n'est alors pas consulté : si le produit a pris la peine
 *    de désigner un palier, un mécène à 12 € sur un autre palier ne doit pas
 *    hériter du plan par la bande.
 * 2. **Un plan sans identifiant configuré** retombe sur le montant — c'est le
 *    mode de fonctionnement tant que la campagne n'existe pas — mais seulement
 *    si le membre a au moins un palier actif. Un montant sans palier, c'est un
 *    ancien mécène dont le montant historique traîne encore sur la fiche.
 * 3. **`patron_status` ne conditionne jamais le droit.** Un `declined_patron`
 *    encore dans sa période payée conserve ses `currently_entitled_tiers`, donc
 *    son plan : c'est Patreon qui décide de la fin de période, pas nous. On
 *    stocke le statut pour l'afficher et le déboguer, rien de plus.
 */
export function plansFromSnapshot(
  snapshot: MembershipSnapshot,
  mapping: PatreonPlanMapping
): SubscriptionPlanKey[] {
  const hasEntitledTier = snapshot.entitledTierIds.length > 0;

  return SUBSCRIPTION_PLAN_KEYS.filter((plan) => {
    const rule = mapping[plan];
    if (!rule) {
      return false;
    }

    if (rule.tierIds.length > 0) {
      return snapshot.entitledTierIds.some((tierId) => rule.tierIds.includes(tierId));
    }

    return hasEntitledTier && snapshot.entitledAmountCents >= rule.minCents;
  });
}
