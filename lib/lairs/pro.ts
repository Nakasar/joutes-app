import 'server-only';

import { getSubscriptionForLair } from "@/lib/db/subscriptions";
import { plansFromSubscription } from "@/lib/subscriptions/access";

/**
 * Le lieu est-il Pro ?
 *
 * Dérivé de l'abonnement qui détient son siège, jamais stocké sur le lieu —
 * c'est ce qui fait qu'un abonnement éteint retire le statut au rendu suivant,
 * sans révocation à écrire.
 */
export async function isLairPro(lairId: string): Promise<boolean> {
  const sponsor = await getSubscriptionForLair(lairId);
  return plansFromSubscription(sponsor).includes("pro");
}
