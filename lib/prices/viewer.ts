import 'server-only';

import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";
import { orderedPriceSources } from "@/lib/prices/preference";
import type { CardPricePreference, CardPriceSource } from "@/lib/types/card-price";

/**
 * La préférence de prix de celui qui regarde la page.
 *
 * Un prix s'affiche sur une douzaine d'écrans — galerie, collection, boosters,
 * échanges, listes de vente, export hors ligne — qui n'ont en commun ni leur
 * chargement ni leurs composants. Faire descendre la préférence de chacun
 * jusqu'à la lecture des relevés demanderait un paramètre à chaque fonction
 * traversée ; elle est donc lue ici, une fois par requête, et `getMarketPrices`
 * s'en sert quand son appelant ne dit rien.
 *
 * `cache` de React est ce qui rend la chose tenable : une page qui chiffre
 * trois listes de cartes lit la session et l'utilisateur une seule fois.
 *
 * Le repli sur l'ordre de la plateforme est silencieux, et c'est voulu : un
 * visiteur sans compte, une session expirée ou une base qui bronche donnent
 * l'affichage d'avant la préférence, jamais une page sans prix.
 */
export const viewerPricePreference = cache(async (): Promise<CardPricePreference | undefined> => {
  // Hors du `try` : hors d'une requête, ou pendant un pré-rendu, `headers()`
  // lève le signal dont Next se sert pour rendre la page dynamique. L'avaler
  // ferait taire ce signal.
  const requestHeaders = await headers();

  try {
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user?.id) {
      return undefined;
    }

    return (await getUserById(session.user.id))?.pricePreference;
  } catch (error) {
    console.error("Préférence de prix illisible, retour à l'ordre de la plateforme :", error);
    return undefined;
  }
});

/** L'ordre des fournisseurs à suivre pour celui qui regarde la page. */
export async function viewerPriceSources(): Promise<readonly CardPriceSource[]> {
  return orderedPriceSources(await viewerPricePreference());
}
