import type { CardmarketPriceGuide, CardmarketProduct } from "@/lib/prices/cardmarket";
import { CARDMARKET_CURRENCY } from "@/lib/prices/cardmarket";
import type { CardPrice, CardPriceOffer, CardPriceValues } from "@/lib/types/card-price";

/**
 * Construction d'un relevé de prix à partir des produits Cardmarket
 * rapprochés d'une carte (cf. lib/prices/cardmarket-matching.ts).
 */

/**
 * Cardmarket écrit `null` — et parfois `0` sur les colonnes de tendance —
 * pour « pas de donnée ». Une carte ne valant pas zéro euro, les deux sont
 * traités de la même façon : la valeur n'est pas écrite.
 */
function amount(value: number | null | undefined): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function definedValues(values: CardPriceValues): CardPriceValues | undefined {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function priceValues(guide: CardmarketPriceGuide): CardPriceValues | undefined {
  return definedValues({
    low: amount(guide.low),
    avg: amount(guide.avg),
    trend: amount(guide.trend),
    avg1: amount(guide.avg1),
    avg7: amount(guide.avg7),
    avg30: amount(guide.avg30),
  });
}

function foilPriceValues(guide: CardmarketPriceGuide): CardPriceValues | undefined {
  return definedValues({
    low: amount(guide["low-foil"]),
    avg: amount(guide["avg-foil"]),
    trend: amount(guide["trend-foil"]),
    avg1: amount(guide["avg1-foil"]),
    avg7: amount(guide["avg7-foil"]),
    avg30: amount(guide["avg30-foil"]),
  });
}

/**
 * Tirage retenu comme prix de référence : le moins cher. Cardmarket vend le
 * tirage normal d'un numéro et ses versions foil comme des produits distincts,
 * sans rien qui les distingue dans ses fichiers — mais une version foil ne
 * vaut jamais moins que la carte dont elle est tirée, et une réédition vaut
 * moins que la première édition. Le moins cher des produits est donc le tirage
 * de base, celui que l'application affiche.
 */
function referenceOffer(offers: CardPriceOffer[]): CardPriceOffer | undefined {
  const rank = (offer: CardPriceOffer): [number, number, number] => [
    offer.prices.trend ?? Number.POSITIVE_INFINITY,
    offer.prices.low ?? Number.POSITIVE_INFINITY,
    offer.productId,
  ];

  return [...offers].sort((a, b) => {
    const [left, right] = [rank(a), rank(b)];
    for (let index = 0; index < left.length; index++) {
      if (left[index] !== right[index]) {
        return left[index] - right[index];
      }
    }
    return 0;
  })[0];
}

/**
 * Relevé d'une carte, ou `undefined` si aucun de ses produits n'est coté —
 * une carte que personne ne vend n'a pas de prix, et lui en écrire un vide
 * n'apprendrait rien.
 */
export function buildCardPrice(
  cardId: string,
  products: CardmarketProduct[],
  priceGuides: Map<number, CardmarketPriceGuide>,
  { sourceUpdatedAt, updatedAt }: { sourceUpdatedAt: Date; updatedAt: Date }
): CardPrice | undefined {
  const offers = products.flatMap<CardPriceOffer>((product) => {
    const guide = priceGuides.get(product.idProduct);
    const prices = guide && priceValues(guide);

    if (!guide || !prices) {
      return [];
    }

    return [{
      productId: product.idProduct,
      expansionId: product.idExpansion,
      productName: product.name,
      prices,
      ...(foilPriceValues(guide) ? { foilPrices: foilPriceValues(guide) } : {}),
    }];
  });

  const reference = referenceOffer(offers);

  if (!reference) {
    return undefined;
  }

  return {
    cardId,
    source: "cardmarket",
    currency: CARDMARKET_CURRENCY,
    prices: reference.prices,
    offers: [...offers].sort((a, b) => a.productId - b.productId),
    sourceUpdatedAt: sourceUpdatedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
