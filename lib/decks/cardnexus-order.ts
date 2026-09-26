import { zoneEntries, type DeckCards } from "@/lib/decks/contents";
import type { DeckZone } from "@/lib/decks/zones";
import { wishlistCardnexusOrder, type WishlistCardnexusOrder } from "@/lib/wishlists/cardnexus-order";

/**
 * Commander un deck sur CardNexus.
 *
 * Même principe que le bouton d'une liste de souhaits (cf.
 * `lib/wishlists/cardnexus-order.ts`) : le Cart Wizard de CardNexus s'ouvre
 * avec les cartes du deck dans le panier, par le lien affilié de Joutes, et
 * une carte que CardNexus ne cote pas reste hors du lien.
 *
 * Module pur : les produits sont lus par `lib/db/deck-cards.ts`.
 */

/** Ce que la commande d'un deck donne : `matched` cartes portées sur `total` cartes distinctes. */
export type DeckCardnexusOrder = WishlistCardnexusOrder;

/** Une carte du deck à commander, toutes zones confondues. */
export type DeckOrderLine = { cardId: string; quantity: number };

/**
 * Les cartes du deck à commander, une ligne par carte.
 *
 * Bornées aux zones que le jeu déclare, comme la taille du deck : une carte
 * qui dort dans une zone que la fiche ne montre pas n'a pas à entrer dans le
 * panier. Une carte jouée dans deux zones — le deck et la réserve — se
 * commande en une ligne qui somme ses exemplaires : c'est la même carte.
 */
export function deckOrderLines(cards: DeckCards | undefined, zones: DeckZone[]): DeckOrderLine[] {
  const quantities = new Map<string, number>();
  for (const zone of zones) {
    for (const entry of zoneEntries(cards, zone.key)) {
      if (entry.quantity > 0) {
        quantities.set(entry.cardId, (quantities.get(entry.cardId) ?? 0) + entry.quantity);
      }
    }
  }
  return [...quantities.entries()].map(([cardId, quantity]) => ({ cardId, quantity }));
}

/**
 * Le lien qui commande ces lignes, et ce qu'il couvre.
 *
 * `productIdOf` dit le produit CardNexus d'une carte, `undefined` quand elle
 * n'en a pas. Un deck ne dit pas de quel tirage sont ses cartes : aucune
 * finition n'est demandée, CardNexus propose toutes celles qu'il a.
 */
export function deckCardnexusOrder(
  lines: DeckOrderLine[],
  productIdOf: (line: DeckOrderLine) => number | undefined
): DeckCardnexusOrder {
  return wishlistCardnexusOrder(lines, productIdOf);
}
