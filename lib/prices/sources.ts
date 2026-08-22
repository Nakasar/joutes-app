import { cardmarketProductUrl } from "@/lib/prices/cardmarket";
import { cardnexusProductUrl } from "@/lib/prices/cardnexus";
import type { CardPriceSource } from "@/lib/types/card-price";

/**
 * Ce qui, à l'écran, dépend de la place de marché d'où vient un prix : son nom
 * et l'adresse de son produit.
 *
 * Un prix ne se lit pas sans savoir qui le publie — deux places de marché ne
 * cotent pas la même chose au même moment — et un lien construit pour l'une
 * mène à une page inexistante chez l'autre. D'où ce point de passage unique,
 * plutôt qu'un `if` par écran.
 */

/**
 * Nom d'une place de marché. Ce sont des marques : elles s'écrivent pareil dans
 * toutes les langues, et ne passent donc pas par les traductions.
 */
export const PRICE_SOURCE_LABELS: Record<CardPriceSource, string> = {
  cardnexus: "CardNexus",
  cardmarket: "Cardmarket",
};

/**
 * Page du produit d'où vient un prix, chez la place de marché qui l'a relevé.
 * `undefined` quand elle ne se construit pas — jeu inconnu de la place de
 * marché, relevé sans produit —, auquel cas le prix s'affiche sans lien plutôt
 * qu'avec un lien mort.
 */
export function marketProductUrl(
  source: CardPriceSource,
  gameSlug: string | undefined,
  productId: number | undefined
): string | undefined {
  return source === "cardnexus"
    ? cardnexusProductUrl(gameSlug, productId)
    : cardmarketProductUrl(gameSlug, productId);
}
