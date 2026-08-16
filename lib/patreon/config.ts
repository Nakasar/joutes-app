import 'server-only';

import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import type { PatreonPlanMapping } from "./resolve";
import { readForcedPlans, readPlanMapping } from "./mapping";

/**
 * Les secrets Patreon, lus en un seul endroit.
 *
 * Même contrat que `lib/push/config.ts`, et pour la même raison : un
 * environnement de développement ou un aperçu n'a aucune de ces variables et ne
 * doit pas pour autant échouer. `patreonConfig()` rend alors `null`, la liaison
 * s'affiche désactivée, le webhook répond 503 et le cron ne fait rien — le site
 * fonctionne, l'abonnement dort.
 *
 * La logique de lecture vit dans `./mapping.ts`, qui prend l'environnement en
 * argument et se teste donc sans bricoler `process.env` depuis un module chargé
 * une seule fois.
 */

export type PatreonConfig = {
  clientId: string;
  clientSecret: string;
  /** Absent tant que la campagne n'existe pas : seul le cron en a besoin. */
  campaignId: string | null;
  /** Jeton du créateur, pour relire un membre sans passer par son jeton à lui. */
  creatorAccessToken: string | null;
};

/**
 * La configuration OAuth, ou `null` si elle est incomplète.
 *
 * Seuls l'identifiant et le secret client sont exigés : ce sont les deux qui
 * suffisent à lier un compte, et lier un compte fonctionne **avant même que la
 * campagne n'existe**. L'identifiant de campagne et le jeton créateur ne servent
 * qu'à la réconciliation, qui se dégrade proprement sans eux.
 */
export function patreonConfig(): PatreonConfig | null {
  const clientId = process.env.PATREON_CLIENT_ID?.trim();
  const clientSecret = process.env.PATREON_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    campaignId: process.env.PATREON_CAMPAIGN_ID?.trim() || null,
    creatorAccessToken: process.env.PATREON_CREATOR_ACCESS_TOKEN?.trim() || null,
  };
}

/** Le secret du webhook, ou `null`. Sans lui, la route refuse tout. */
export function patreonWebhookSecret(): string | null {
  return process.env.PATREON_WEBHOOK_SECRET?.trim() || null;
}

export function patreonPlanMapping(): PatreonPlanMapping {
  return readPlanMapping(process.env);
}

export function devForcedPlans(): SubscriptionPlanKey[] {
  return readForcedPlans(process.env);
}

/**
 * L'adresse publique de la page Patreon, vers laquelle la page d'offres renvoie.
 * Non définie, l'appel à l'action devient un état « bientôt disponible » — ce
 * qui rend la page livrable avant l'ouverture de la campagne.
 */
export function patreonPublicUrl(): string | null {
  return process.env.NEXT_PUBLIC_PATREON_URL?.trim() || null;
}
