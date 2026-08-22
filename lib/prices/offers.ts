import type { CardPriceOffer } from "@/lib/types/card-price";

/**
 * Choix du tirage qui représente une carte, quelle que soit la place de marché.
 *
 * Une carte de l'application est un numéro de collection ; une place de marché
 * en vend plusieurs tirages — normal, foil, réédition —, et le relevé les garde
 * tous (cf. docs/CARD_PRICES.md). Il faut pourtant un seul montant à mettre à
 * côté du nom d'une carte : c'est celui-ci.
 */

/**
 * Tirage retenu comme prix de référence : le moins cher. Une version foil ne
 * vaut jamais moins que la carte dont elle est tirée, et une réédition vaut
 * moins que la première édition — le moins cher des produits est donc le
 * tirage de base, celui que l'application affiche. C'est un prix « à partir
 * de ».
 *
 * « Moins cher » se lit sur la tendance, le prix lissé par la place de marché :
 * le prix bas ne dit que ce que demande une seule offre, parfois une carte
 * abîmée, et il ne sert donc qu'à départager deux tendances égales — ou à
 * classer les produits que la place de marché ne sait pas encore situer, faute
 * de ventes, et qui passent en dernier.
 *
 * À montants égaux, l'identifiant du produit puis le nom du tirage tranchent :
 * deux imports du même relevé doivent choisir le même, sans quoi le lien d'une
 * carte changerait de cible sans que son prix bouge.
 */
export function referenceOffer(offers: CardPriceOffer[]): CardPriceOffer | undefined {
  const rank = (offer: CardPriceOffer): [number, number, number, string] => [
    offer.prices.trend ?? Number.POSITIVE_INFINITY,
    offer.prices.low ?? Number.POSITIVE_INFINITY,
    offer.productId,
    offer.finish ?? "",
  ];

  return [...offers].sort((a, b) => {
    const [left, right] = [rank(a), rank(b)];
    for (let index = 0; index < left.length; index++) {
      const [x, y] = [left[index], right[index]];
      if (x !== y) {
        return typeof x === "number" && typeof y === "number" ? x - y : String(x) < String(y) ? -1 : 1;
      }
    }
    return 0;
  })[0];
}
