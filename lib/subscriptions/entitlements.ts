import {
  ALL_ENTITLEMENTS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLAN_KEYS,
  type EntitlementKey,
  type PlanPermission,
  type SubscriptionPlanKey,
} from "@/lib/constants/subscription-plans";

/**
 * Le calcul des droits, à partir des plans qu'un compte porte.
 *
 * Tout est ici plutôt que dans `lib/db/subscriptions.ts` pour une raison
 * mécanique : `lib/mongodb.ts` ouvre une connexion au chargement du module et ne
 * peut donc pas être importé par un test. Ce qui mérite d'être prouvé vit dans
 * ce fichier-ci, sans base de données ; le voisin ne fait plus que lire et
 * écrire des documents. Même découpage que `lib/users/document.ts`.
 *
 * Un compte porte **une liste** de plans, jamais un seul. C'est la forme de
 * Patreon : `currently_entitled_tiers` est un tableau, et il en contient
 * couramment plusieurs. Un champ singulier perdrait de l'information dès le
 * premier abonné qui prend les deux offres.
 */

/**
 * Les droits ouverts par une liste de plans, doublons fondus.
 *
 * `includes` est suivi de proche en proche : si un jour Pro inclut Expert, les
 * droits d'Expert entrent ici sans que rien d'autre ne bouge. La traversée se
 * garde des cycles — une table mal saisie (A inclut B, B inclut A) doit rendre
 * une réponse, pas boucler indéfiniment.
 */
export function resolveEntitlements(plans: readonly SubscriptionPlanKey[]): EntitlementKey[] {
  const granted = new Set<EntitlementKey>();

  for (const plan of expandPlans(plans)) {
    for (const entitlement of SUBSCRIPTION_PLANS[plan].entitlements) {
      granted.add(entitlement);
    }
  }

  return [...granted].sort();
}

/**
 * Les paliers réellement portés, `includes` suivi de proche en proche.
 *
 * La traversée se garde des cycles — une table mal saisie (A inclut B, B inclut
 * A) doit rendre une réponse, pas boucler indéfiniment — et écarte au passage
 * les clés inconnues : un palier lu en base et supprimé de la table depuis ne
 * doit rien ouvrir.
 */
function expandPlans(plans: readonly SubscriptionPlanKey[]): SubscriptionPlanKey[] {
  const seen = new Set<SubscriptionPlanKey>();
  const queue = [...plans];

  while (queue.length > 0) {
    const plan = queue.shift()!;

    if (seen.has(plan) || !SUBSCRIPTION_PLAN_KEYS.includes(plan)) {
      continue;
    }
    seen.add(plan);

    queue.push(...SUBSCRIPTION_PLANS[plan].includes);
  }

  return [...seen];
}

/**
 * Les permissions qu'ouvrent ces paliers.
 *
 * Jumelle de `resolveEntitlements`, pour l'autre espace de noms : ce qu'elle
 * rend se compare à `user.permissions[]` et se lit par `hasPermission`. Le
 * détour par une fonction plutôt que par la table directement existe pour
 * `includes` — le jour où Pro inclura Expert, ses permissions suivront ici sans
 * qu'on ait à les recopier.
 */
export function resolvePlanPermissions(plans: readonly SubscriptionPlanKey[]): PlanPermission[] {
  const granted = new Set<PlanPermission>();

  for (const plan of expandPlans(plans)) {
    for (const permission of SUBSCRIPTION_PLANS[plan].permissions) {
      granted.add(permission);
    }
  }

  return [...granted].sort();
}

export function grantsEntitlement(
  plans: readonly SubscriptionPlanKey[],
  entitlement: EntitlementKey
): boolean {
  return resolveEntitlements(plans).includes(entitlement);
}

/**
 * Le nombre de lieux que ces plans permettent de parrainer.
 *
 * Le maximum, et non la somme : cumuler Expert et Pro n'offre pas plus de
 * sièges que Pro seul. Deux abonnements ne se additionnent que si un jour on le
 * décide explicitement.
 */
export function seatsFor(plans: readonly SubscriptionPlanKey[]): number {
  return plans.reduce(
    (max, plan) =>
      SUBSCRIPTION_PLAN_KEYS.includes(plan) ? Math.max(max, SUBSCRIPTION_PLANS[plan].lairSeats) : max,
    0
  );
}

/**
 * Le plan à montrer quand un compte en porte plusieurs — sur un badge, il n'y a
 * la place que d'un seul. Le dernier dans l'ordre de la table l'emporte, ce qui
 * fait de cet ordre la hiérarchie d'affichage : réordonner la table réordonne
 * les badges, sans autre code à toucher.
 */
export function displayPlan(plans: readonly SubscriptionPlanKey[]): SubscriptionPlanKey | null {
  let best: SubscriptionPlanKey | null = null;

  for (const plan of plans) {
    const rank = SUBSCRIPTION_PLAN_KEYS.indexOf(plan);
    if (rank === -1) {
      continue;
    }
    if (best === null || rank > SUBSCRIPTION_PLAN_KEYS.indexOf(best)) {
      best = plan;
    }
  }

  return best;
}

/** Un abonnement est actif tant qu'il porte au moins un plan. */
export function isActive(plans: readonly SubscriptionPlanKey[]): boolean {
  return plans.some((plan) => SUBSCRIPTION_PLAN_KEYS.includes(plan));
}

export { ALL_ENTITLEMENTS };
