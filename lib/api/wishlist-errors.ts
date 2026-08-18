import { NextResponse } from "next/server";
import { WishlistLimitError, WishlistReadOnlyError } from "@/lib/db/wishlists";

/**
 * Traduit les refus des listes de souhaits en réponses HTTP.
 *
 * Un seul endroit, comme `lib/api/trade-errors.ts` : sept routes écrivent dans
 * ces listes, et la même erreur y recevait autrement sept statuts au fil des
 * copier-coller.
 *
 * Rend `null` quand l'erreur n'est pas reconnue — à l'appelant de journaliser et
 * de rendre son 500. Une valeur nulle plutôt qu'une réponse par défaut : avaler
 * une erreur inconnue dans un 400 la ferait disparaître des journaux.
 */
export function wishlistErrorResponse(error: unknown): NextResponse | null {
  // 403 et non 409 : ce n'est pas un conflit avec l'existant, c'est un droit qui
  // manque. Le code machine évite au client de lire le message.
  if (error instanceof WishlistLimitError) {
    return NextResponse.json(
      { error: error.message, code: "wishlist-limit", limit: error.limit },
      { status: 403 }
    );
  }

  if (error instanceof WishlistReadOnlyError) {
    return NextResponse.json(
      { error: error.message, code: "wishlist-read-only" },
      { status: 403 }
    );
  }

  // Le nom en double reste un vrai conflit : la liste existe, elle porte déjà ce
  // nom-là.
  if (error instanceof Error && error.message.includes("existe déjà")) {
    return NextResponse.json({ error: error.message, code: "wishlist-name-taken" }, { status: 409 });
  }

  return null;
}
