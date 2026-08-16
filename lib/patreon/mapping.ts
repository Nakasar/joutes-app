import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLAN_KEYS,
  isSubscriptionPlanKey,
  type SubscriptionPlanKey,
} from "@/lib/constants/subscription-plans";
import type { PatreonPlanMapping } from "./resolve";

/**
 * La lecture de la configuration Patreon, séparée de l'environnement.
 *
 * Ces fonctions prennent l'environnement en argument plutôt que de lire
 * `process.env` : c'est ce qui les rend testables, et `lib/patreon/config.ts`
 * n'a plus qu'à leur passer `process.env`. Le découpage suit celui de
 * `lib/users/document.ts` — la logique d'un côté, l'accès au monde de l'autre.
 *
 * Le mapping est **dérivé des clés de la table des plans** : ajouter une offre
 * fait automatiquement chercher ses variables, sans que personne n'ait à penser
 * à les déclarer ici.
 */

export type EnvLike = Record<string, string | undefined>;

/** `PATREON_TIER_EXPERT`, `PATREON_MIN_CENTS_PRO`… */
export function tierEnvName(plan: SubscriptionPlanKey): string {
  return `PATREON_TIER_${plan.toUpperCase()}`;
}

export function minCentsEnvName(plan: SubscriptionPlanKey): string {
  return `PATREON_MIN_CENTS_${plan.toUpperCase()}`;
}

/**
 * Le mapping palier Patreon → plan, tel que l'environnement le décrit.
 *
 * Toujours défini, éventuellement vide : tant que la campagne n'existe pas,
 * aucun identifiant de palier n'est connu et c'est le seuil de montant qui
 * prend le relais. Le montant déclaré dans la table des plans sert de valeur par
 * défaut, pour qu'un environnement minimal se comporte comme le produit
 * l'annonce.
 */
export function readPlanMapping(env: EnvLike): PatreonPlanMapping {
  return Object.fromEntries(
    SUBSCRIPTION_PLAN_KEYS.map((plan) => [
      plan,
      {
        tierIds: splitTierIds(env[tierEnvName(plan)]),
        minCents: readMinCents(env[minCentsEnvName(plan)], SUBSCRIPTION_PLANS[plan].monthlyCents),
      },
    ])
  ) as PatreonPlanMapping;
}

/**
 * Les identifiants de paliers, séparés par des virgules.
 *
 * Plusieurs paliers peuvent ouvrir le même plan — une offre annuelle et une
 * offre mensuelle, un ancien palier conservé pour les abonnés historiques.
 */
function splitTierIds(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function readMinCents(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Plans forcés pour le développement et les aperçus.
 *
 * Sans campagne Patreon, c'est le seul moyen de montrer les écrans à quelqu'un.
 * **Ignoré en production** : la variable pourrait sinon offrir un abonnement à
 * tout le monde par une simple erreur de configuration.
 */
export function readForcedPlans(env: EnvLike): SubscriptionPlanKey[] {
  if (env.NODE_ENV === "production") {
    return [];
  }

  return (env.PATREON_DEV_FORCE_PLAN ?? "")
    .split(",")
    .map((plan) => plan.trim())
    .filter(isSubscriptionPlanKey);
}
