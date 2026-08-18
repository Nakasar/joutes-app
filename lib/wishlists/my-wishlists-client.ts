"use client";

import type { MyWishlists } from "@/lib/wishlists/shortcut";

/**
 * Mes listes de souhaits, côté navigateur, chargées **une fois par page**.
 *
 * Le bouton « ajouter à une liste » est rendu par carte : sur une galerie, il y
 * en a soixante. Chacun a besoin de connaître les listes pour proposer son
 * raccourci — sans cache partagé, cela ferait soixante requêtes identiques à
 * l'affichage d'une page.
 *
 * Ce module ne mémorise plus de « dernière liste utilisée ». Cette préférence
 * approximait le même signal que la liste par défaut — « où veut-il que ça
 * aille ? » —, mais devinée plutôt que dite, invisible, et propre à un seul
 * navigateur. La liste par défaut la remplace : elle s'affiche, elle se change,
 * et elle vaut d'un appareil à l'autre.
 */

let pending: Promise<MyWishlists> | null = null;
let loaded: MyWishlists | null = null;

/**
 * Échoue quand la lecture échoue — un panneau vide et un panneau qu'on n'a pas
 * pu lire ne disent pas la même chose. Rendre une liste vide dans les deux cas
 * ferait annoncer « aucune liste » à une session expirée.
 */
export function loadMyWishlists(): Promise<MyWishlists> {
  pending ??= fetch("/api/wishlists/mine")
    .then((res) => {
      if (!res.ok) throw new Error(`Lecture des listes de souhaits : ${res.status}`);
      return res.json() as Promise<MyWishlists>;
    })
    .then((data) => {
      loaded = data;
      return data;
    })
    .catch((error) => {
      // Un échec ne se garde pas : la prochaine ouverture du panneau doit
      // pouvoir réessayer.
      pending = null;
      throw error;
    });

  return pending;
}

/**
 * Ce que le cache sait déjà, sans attendre. Un bouton monté après le premier
 * chargement affiche ainsi son raccourci dès le premier rendu, au lieu de le
 * faire apparaître après coup et de décaler ce qui l'entoure.
 */
export function getLoadedMyWishlists(): MyWishlists | null {
  return loaded;
}

/** À appeler après avoir créé une liste : le cache ne la connaît pas encore. */
export function invalidateMyWishlists(): void {
  pending = null;
  loaded = null;
}
