import { cache } from "react";
import { getPortalSettings } from "./actions.ts";

/**
 * Réglages du portail, lus une seule fois par rendu.
 *
 * Le layout en a besoin pour son cadre, et plusieurs sections pour leur contenu.
 * Comme layout et page rendent en parallèle, l'appel direct les faisait lire
 * deux fois — deux vérifications de session et deux requêtes Mongo pour une même
 * valeur. `cache` de React mémoïse l'appel pour la durée d'un rendu : le second
 * appelant reçoit la promesse du premier.
 *
 * La mémoïsation vit ici et non dans `actions.ts`, qui est un module
 * `"use server"` : ses exports sont des actions, pas des fonctions à envelopper.
 */
export const readPortalSettings = cache(async (eventId: string) => {
  const result = await getPortalSettings(eventId);
  return result.success ? result.data : null;
});
