import 'server-only';

import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/config/admins";
import type { EntitlementKey, SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import { devForcedPlans } from "@/lib/patreon/config";
import {
  getLairIdsWithPlan,
  getSubscriptionByUserId,
  getSubscriptionForLair,
} from "@/lib/db/subscriptions";
import type { Lair } from "@/lib/types/Lair";
import type { Subscription, SubscriptionSummary } from "@/lib/types/Subscription";
import { displayPlan, grantsEntitlement, resolveEntitlements, seatsFor } from "./entitlements";
import { effectivePlans, grantedPlanKeys } from "./grants";

/**
 * Les droits d'abonnement du compte connecté.
 *
 * C'est l'interface que le reste de l'application appelle : volontairement
 * calquée sur `lib/db/permissions.ts` (`hasPermission` / `requirePermission`),
 * pour qu'elle se lise comme un voisin.
 *
 * **Les deux systèmes restent distincts.** Les permissions sont des capacités
 * d'équipe accordées à la main — modérer les erratas, importer un quizz. Les
 * droits d'abonnement s'achètent et se recalculent tout seuls. Fusionner leurs
 * chemins d'écriture ferait qu'une rétrogradation Patreon pourrait retirer un
 * droit de modérateur ; les garder séparés rend cela impossible.
 */

/**
 * Les plans du compte connecté, mémoïsés le temps d'une requête.
 *
 * `cache()` de React, et non un mémo au niveau du module : un conteneur
 * serverless chaud sert plusieurs requêtes, et un mémo de module ferait fuiter
 * l'abonnement d'un visiteur vers le suivant. Dix vérifications dans un même
 * rendu ne coûtent ainsi qu'une lecture.
 *
 * Premier usage de `cache()` dans ce dépôt : si le motif se répand, c'est ici
 * qu'il faut regarder pourquoi.
 */
export const getMyPlans = cache(async (): Promise<SubscriptionPlanKey[]> => {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return [];
  }

  return plansForUserId(session.user.id);
});

/**
 * Les plans d'un compte désigné.
 *
 * Existe pour les appelants qui tiennent déjà la session — `getMyPermissions`,
 * par exemple, qui la lit pour ses propres besoins. Passer par `getMyPlans` les
 * ferait la relire ; ici, ils la réutilisent.
 */
export const plansForUserId = cache(async (userId: string): Promise<SubscriptionPlanKey[]> => {
  const forced = devForcedPlans();
  if (forced.length > 0) {
    return forced;
  }

  return plansFromSubscription(await getSubscriptionByUserId(userId));
});

/**
 * Les plans que porte un abonnement déjà lu.
 *
 * Un seul endroit applique le forçage de développement, et c'est celui-ci : un
 * appelant qui déduirait les plans de `subscription.plans` sans passer par ici
 * verrait un écran différent des vérifications de droits, sur un aperçu.
 *
 * Développement et aperçus seulement : sans campagne Patreon, c'est le seul
 * moyen de montrer les écrans, et `readForcedPlans` refuse de rien forcer en
 * production.
 */
function plansFromSubscription(subscription: Subscription | null): SubscriptionPlanKey[] {
  const forced = devForcedPlans();
  if (forced.length > 0) {
    return forced;
  }

  // Le seul point de composition de toute l'application : `plansForUserId`,
  // `getMyPlans` et `getMySubscriptionSummary` passent tous par ici, donc le
  // badge, le contour, les droits et les sièges de lieu suivent sans le savoir.
  return effectivePlans({
    paid: subscription?.plans ?? [],
    granted: grantedPlanKeys(subscription?.grantedPlans ?? []),
  });
}

/**
 * Vrai si le compte connecté a ce droit.
 *
 * Un administrateur les a tous — comme pour les permissions. Ce n'est pas une
 * politesse : tant que la campagne Patreon n'existe pas, c'est le principal
 * moyen d'exercer la fonctionnalité en production.
 */
export async function hasEntitlement(entitlement: EntitlementKey): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.email) {
    return false;
  }

  if (isAdmin(session.user.email)) {
    return true;
  }

  return grantsEntitlement(await getMyPlans(), entitlement);
}

export async function requireEntitlement(entitlement: EntitlementKey): Promise<true> {
  if (await hasEntitlement(entitlement)) {
    return true;
  }

  throw new Error('Not authorized.');
}

/**
 * Vrai si ce lieu est parrainé par un abonnement Pro **actif**.
 *
 * Deux lectures indexées, et seulement sur les écrans de lieu. Le statut n'est
 * jamais recopié sur le lieu : il se dérive de l'abonnement qui détient son
 * siège. Quand cet abonnement s'éteint, `plans` se vide et le lieu perd Pro au
 * rendu suivant — sans révocation à écrire, et sans fenêtre d'incohérence.
 */
export const lairHasPro = cache(async (lairId: Lair['id']): Promise<boolean> => {
  const subscription = await getSubscriptionForLair(lairId);

  // Les paliers composés, et non `subscription.plans` : un lieu parrainé par
  // quelqu'un dont le Pro a été offert par l'équipe ouvre les mêmes droits qu'un
  // lieu parrainé par un abonné payant. Lire le champ brut ici, c'était créer
  // deux classes de Pro.
  return plansFromSubscription(subscription).includes("pro");
});

/**
 * Les lieux Pro parmi ceux demandés, en une seule requête.
 *
 * À utiliser dès qu'on affiche une liste : appeler `lairHasPro` dans une boucle
 * ferait un N+1 sur la page d'index des lieux.
 */
export async function proLairIds(lairIds: Lair['id'][]): Promise<Set<Lair['id']>> {
  return getLairIdsWithPlan(lairIds, "pro");
}

/** Le plan à afficher sur un badge, ou `null`. */
export async function myDisplayPlan(): Promise<SubscriptionPlanKey | null> {
  return displayPlan(await getMyPlans());
}

/** Tout ce dont l'écran « mon abonnement » a besoin, en une lecture. */
export async function getMySubscriptionSummary(): Promise<SubscriptionSummary | null> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return null;
  }

  // Les plans se déduisent de l'abonnement qu'on vient de lire : repasser par
  // `getMyPlans` relirait la session et le document pour rien.
  const subscription = await getSubscriptionByUserId(session.user.id);
  const plans = plansFromSubscription(subscription);
  const seats = subscription?.seats ?? [];
  const seatsTotal = seatsFor(plans);

  return {
    plans,
    // La part venue de Patreon, brute : l'écran s'en sert pour distinguer un
    // abonnement d'un cadeau, ce que les droits, eux, ne font jamais.
    paidPlans: subscription?.plans ?? [],
    grantedPlans: subscription?.grantedPlans ?? [],
    entitlements: resolveEntitlements(plans),
    seats,
    seatsTotal,
    seatsRemaining: Math.max(0, seatsTotal - seats.length),
    linkedToProvider: Boolean(subscription?.providerUserId),
    patronStatus: subscription?.patronStatus ?? null,
    syncedAt: subscription?.syncedAt ?? null,
  };
}
