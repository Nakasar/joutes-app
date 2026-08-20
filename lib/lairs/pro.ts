import 'server-only';

import { getSubscriptionForLair } from "@/lib/db/subscriptions";
import { plansFromSubscription } from "@/lib/subscriptions/access";

/**
 * Ce que l'abonnement Joutes Pro déverrouille sur la vitrine.
 *
 * La ligne de partage suit la maquette : ce qui relève de la **marque blanche**
 * — le logo, l'accent, la teinte des surfaces, l'ordre des sections — et les
 * **contenus intégrés** demandent Pro. Le reste — actualités, présentation,
 * photos, horaires, contact, liens, événement à la une — reste ouvert à tout
 * lieu : un lieu sans abonnement garde une page complète et un agenda public,
 * il ne la met simplement pas à ses couleurs.
 *
 * La bannière n'est pas dans la liste alors que la maquette la cite : elle se
 * règle déjà librement dans l'onglet « Détails », et la verrouiller ici
 * retirerait à des lieux existants quelque chose qu'ils utilisent.
 */
export const PRO_ONLY_FIELDS = ["logo", "accentColor", "tintSurfaces", "sections", "videoUrl"] as const;

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
