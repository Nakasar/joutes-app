import { CARDNEXUS_ORDER_MAX_LINES, cardnexusOrderUrl, type CardnexusOrderLine } from "@/lib/prices/cardnexus";

/**
 * Commander une liste de souhaits sur CardNexus.
 *
 * Le bouton « Acheter sur CardNexus » d'une liste ouvre le Cart Wizard de la
 * place de marché avec les cartes de la liste déjà dedans, par un lien suivi
 * du programme d'affiliation (cf. `cardnexusOrderUrl`, et
 * docs/CARD_PRICES.md, « Commander une liste de souhaits »).
 *
 * Ce lien ne prend que des identifiants de produit CardNexus. Nous n'en avons
 * pas sur les cartes ; nous en avons sur leurs relevés de prix : l'import
 * CardNexus rattache chaque produit à sa carte par extension et numéro, et
 * `offers` garde le `productId`. C'est donc le relevé qui dit quoi commander
 * (`cardnexusProductId`, `lib/prices/copies.ts`) — une carte que CardNexus ne
 * cote pas n'a pas de produit à commander, et reste hors du lien.
 *
 * Module pur : les relevés sont lus par `lib/db/wishlists.ts`.
 */

/** Une carte souhaitée, telle que la commande la lit. */
export type OrderableWish = {
  cardId: string;
  printingId?: string;
  foil?: boolean;
  quantity: number;
};

/**
 * Ce que la commande d'une liste donne : le lien, et ce qu'il couvre.
 *
 * `matched` compte les souhaits que le lien porte ; `total`, tous ceux de la
 * liste. L'écran le dit à côté du bouton : un panier de douze cartes sur vingt
 * ne se lit pas comme la liste entière.
 */
export type WishlistCardnexusOrder = {
  /** Absent quand aucun souhait n'a de produit CardNexus. */
  url?: string;
  matched: number;
  total: number;
};

/**
 * Les lignes de commande d'une liste, et le lien qui les porte.
 *
 * `productIdOf` dit le produit CardNexus d'un souhait — sa carte, ou sa
 * variante quand elle est cotée à part —, `undefined` quand il n'en a pas. Ce
 * souhait-là est laissé hors du lien, pas remplacé par une autre impression :
 * on commanderait alors une carte que personne n'a demandée.
 *
 * Un souhait foil demande « n'importe quel tirage autre que standard » (`f`)
 * plutôt qu'un tirage nommé : nous ne savons d'un exemplaire que s'il est
 * foil, pas lequel des foils. Aucune langue n'est écrite : nos catalogues sont
 * anglais, mais la liste ne dit pas dans quelle langue son auteur veut lire
 * ses cartes — CardNexus les lui proposera toutes.
 */
export function wishlistCardnexusOrder<T extends OrderableWish>(
  wishes: T[],
  productIdOf: (wish: T) => number | undefined
): WishlistCardnexusOrder {
  const lines: CardnexusOrderLine[] = [];

  for (const wish of wishes) {
    const productId = productIdOf(wish);
    if (productId === undefined) {
      continue;
    }
    lines.push({ productId, quantity: wish.quantity, ...(wish.foil ? { finish: "f" } : {}) });
  }

  const url = cardnexusOrderUrl(lines);

  return {
    ...(url ? { url } : {}),
    matched: Math.min(lines.length, CARDNEXUS_ORDER_MAX_LINES),
    total: wishes.length,
  };
}
