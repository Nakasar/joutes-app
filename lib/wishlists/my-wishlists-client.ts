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

const EMPTY: MyWishlists = { personal: [], groups: [] };

let pending: Promise<MyWishlists> | null = null;

export function loadMyWishlists(): Promise<MyWishlists> {
  pending ??= fetch("/api/wishlists/mine")
    .then((res) => (res.ok ? (res.json() as Promise<MyWishlists>) : EMPTY))
    .catch(() => EMPTY)
    .then((data) => {
      // Un échec (hors ligne, session expirée) ne se garde pas : la prochaine
      // ouverture du panneau doit pouvoir réessayer.
      if (data === EMPTY) pending = null;
      return data;
    });

  return pending;
}

/** À appeler après avoir créé une liste : le cache ne la connaît pas encore. */
export function invalidateMyWishlists(): void {
  pending = null;
}

export function readPreferredWishlistId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFERRED_WISHLIST_KEY);
  } catch {
    // Stockage refusé (navigation privée, réglages stricts) : le raccourci se
    // débrouille sans préférence plutôt que de faire échouer l'affichage.
    return null;
  }
}

export function writePreferredWishlistId(wishlistId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERRED_WISHLIST_KEY, wishlistId);
  } catch {
    // Sans mémoire, le raccourci reste utilisable — il vise simplement la
    // liste unique, ou disparaît.
  }
}
