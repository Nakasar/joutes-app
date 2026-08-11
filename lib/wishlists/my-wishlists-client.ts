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
 * La préférence (dernière liste utilisée) vit dans le stockage local : elle
 * n'engage rien, ne mérite pas un aller-retour serveur, et se perdre d'un
 * appareil à l'autre est sans conséquence — le raccourci retombe alors sur la
 * liste unique, ou s'efface.
 */

const PREFERRED_WISHLIST_KEY = "joutes.wishlists.preferred";

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

// Lue une fois par page : le bouton est rendu par carte, et soixante lectures
// de stockage pour une valeur qui ne bouge pas seraient soixante de trop.
let preferredId: string | null | undefined;

export function readPreferredWishlistId(): string | null {
  if (typeof window === "undefined") return null;
  if (preferredId !== undefined) return preferredId;
  try {
    preferredId = window.localStorage.getItem(PREFERRED_WISHLIST_KEY);
  } catch {
    // Stockage refusé (navigation privée, réglages stricts) : le raccourci se
    // débrouille sans préférence plutôt que de faire échouer l'affichage.
    preferredId = null;
  }
  return preferredId;
}

export function writePreferredWishlistId(wishlistId: string): void {
  preferredId = wishlistId;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERRED_WISHLIST_KEY, wishlistId);
  } catch {
    // Sans mémoire, le raccourci reste utilisable — il vise simplement la
    // liste unique, ou disparaît.
  }
}
