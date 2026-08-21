import {
  SUBSCRIPTION_PLAN_KEYS,
  isSubscriptionPlanKey,
  type SubscriptionPlanKey,
} from "@/lib/constants/subscription-plans";
import type { GrantedPlan } from "@/lib/types/Subscription";

/**
 * La composition des paliers payés et des paliers offerts.
 *
 * Un compte peut tenir son palier de Patreon, de l'équipe, ou des deux. Les
 * droits ne font pas la différence — c'est l'exigence — mais l'écran de compte,
 * lui, doit la faire, sans quoi quelqu'un irait chercher sur Patreon un
 * prélèvement qui n'existe pas.
 *
 * Module pur : `lib/mongodb.ts` ouvre une connexion au chargement, donc la règle
 * ne serait pas testable si elle vivait à côté des accès base. Et c'est
 * précisément la règle qu'il faut prouver, puisqu'elle protège les octrois de
 * l'écrasement par une synchronisation.
 */

export function grantedPlanKeys(granted: readonly GrantedPlan[]): SubscriptionPlanKey[] {
  return granted.map((entry) => entry?.plan).filter(isSubscriptionPlanKey);
}

/**
 * Les paliers effectivement portés par un compte.
 *
 * L'union sort **dans l'ordre de la table**, et pas dans l'ordre d'arrivée :
 * sinon un palier offert puis un palier payé donneraient un badge différent d'un
 * palier payé puis offert, alors que le compte est dans le même état.
 */
export function effectivePlans({
  paid,
  granted,
}: {
  paid: readonly SubscriptionPlanKey[];
  granted: readonly SubscriptionPlanKey[];
}): SubscriptionPlanKey[] {
  const held = new Set([...paid, ...granted].filter(isSubscriptionPlanKey));

  return SUBSCRIPTION_PLAN_KEYS.filter((plan) => held.has(plan));
}

/**
 * Un lieu tient-il Joutes Pro ?
 *
 * La règle que `lairHasPro` applique, isolée ici pour deux raisons : elle est
 * ainsi éprouvable — `lib/subscriptions/access.ts` est `server-only` et ouvre
 * une connexion Mongo au chargement — et il n'en existe qu'une copie. Une
 * version précédente du test rejouait une réimplémentation à la main, qui
 * n'aurait rien attrapé d'une régression dans la vraie fonction.
 */
export function lairHoldsPro({
  hasGrant,
  paid,
  granted,
}: {
  /** L'équipe a offert l'accès au lieu lui-même. */
  hasGrant: boolean;
  /** Les paliers payés de l'abonnement qui parraine le lieu. */
  paid: readonly SubscriptionPlanKey[];
  /** Ceux que l'équipe a offerts à ce même abonné. */
  granted: readonly SubscriptionPlanKey[];
}): boolean {
  return hasGrant || effectivePlans({ paid, granted }).includes("pro");
}

/**
 * D'où vient ce palier. Sert à l'écran de compte, jamais aux droits.
 * Rend `null` si le compte ne le porte pas du tout.
 */
export function planOrigin(
  {
    paid,
    granted,
  }: {
    paid: readonly SubscriptionPlanKey[];
    granted: readonly SubscriptionPlanKey[];
  },
  plan: SubscriptionPlanKey
): "paid" | "granted" | "both" | null {
  const isPaid = paid.includes(plan);
  const isGranted = granted.includes(plan);

  if (isPaid && isGranted) {
    return "both";
  }
  if (isPaid) {
    return "paid";
  }
  if (isGranted) {
    return "granted";
  }
  return null;
}
