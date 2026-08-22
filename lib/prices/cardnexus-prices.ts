import { CARDNEXUS_CURRENCY, type CardnexusFinishPrices, type CardnexusProduct } from "@/lib/prices/cardnexus";
import { referenceOffer } from "@/lib/prices/offers";
import type { CardPrice, CardPriceOffer, CardPriceValues } from "@/lib/types/card-price";

/**
 * Construction d'un relevé de prix à partir des produits CardNexus rapprochés
 * d'une carte (cf. lib/prices/cardnexus-matching.ts).
 *
 * CardNexus cote chaque **tirage** d'un produit à part — `Standard`, `Foil`, et
 * ce que le jeu compte d'autres. Un tirage donne donc une offre, et une carte
 * dont CardNexus connaît deux tirages porte deux offres de même `productId`,
 * distinguées par leur `finish`. Le prix de référence en découle comme
 * ailleurs : le moins cher, c'est-à-dire le tirage de base.
 */

/**
 * Les prix d'un tirage retenus pour le relevé, ou `undefined` si CardNexus
 * n'en publie aucun en euros.
 *
 * Le feed cote un tirage jusqu'à trois fois : l'instantané quotidien de
 * Cardmarket, celui de TCGplayer, et les annonces vivant sur la place de marché
 * CardNexus. Nos relevés ne portent qu'une devise et l'application compte en
 * euros :
 *
 * - l'instantané Cardmarket (en euros) est retenu en premier — c'est le plus
 *   complet, et le seul à porter un prix agrégé ;
 * - à défaut, l'annonce la moins chère de la place de marché CardNexus, que le
 *   feed convertit déjà en euros ;
 * - TCGplayer est laissé de côté : ses montants sont en dollars, et convertir
 *   une devise reviendrait à inventer un prix que personne n'affiche.
 *
 * Les trois valeurs de CardNexus se rangent dans les nôtres : le prix agrégé —
 * celui que CardNexus montre comme prix de la carte — est la tendance, le prix
 * médian tient lieu de moyenne, et le prix bas reste le prix bas. Le prix haut
 * n'a pas d'équivalent et n'est pas conservé : rien ne l'affiche.
 */
export function finishPriceValues(finish: CardnexusFinishPrices): CardPriceValues | undefined {
  const amount = (value: number | null | undefined): number | undefined =>
    typeof value === "number" && value > 0 ? value : undefined;

  const defined = (values: CardPriceValues): CardPriceValues | undefined => {
    const entries = Object.entries(values).filter(([, value]) => value !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  };

  if (finish.cardmarket?.currency === CARDNEXUS_CURRENCY) {
    const values = defined({
      low: amount(finish.cardmarket.low),
      avg: amount(finish.cardmarket.mid),
      trend: amount(finish.cardmarket.marketValue),
    });

    if (values) {
      return values;
    }
  }

  const listing = finish.cardnexus?.low;

  return listing?.currency === CARDNEXUS_CURRENCY ? defined({ low: amount(listing.amount) }) : undefined;
}

/**
 * Nom du produit tel que CardNexus l'écrit. La variante fait partie de son
 * identité — deux produits d'un même numéro ne diffèrent souvent que par elle —
 * et se lit entre parenthèses, comme Cardmarket écrit les siennes.
 */
export function cardnexusProductName(product: CardnexusProduct): string {
  return product.variant ? `${product.name} (${product.variant})` : product.name;
}

/**
 * Relevé d'une carte, ou `undefined` si aucun de ses tirages n'est coté en
 * euros — une carte que personne ne vend n'a pas de prix, et lui en écrire un
 * vide n'apprendrait rien.
 */
export function buildCardnexusPrice(
  cardId: string,
  products: CardnexusProduct[],
  pricesByProduct: Map<number, Record<string, CardnexusFinishPrices>>,
  { sourceUpdatedAt, updatedAt }: { sourceUpdatedAt: Date; updatedAt: Date }
): CardPrice | undefined {
  const offers = products.flatMap<CardPriceOffer>((product) => {
    const byFinish = pricesByProduct.get(product.id);

    if (!byFinish) {
      return [];
    }

    return Object.entries(byFinish).flatMap<CardPriceOffer>(([finish, finishPrices]) => {
      const prices = finishPriceValues(finishPrices);

      return prices
        ? [
            {
              productId: product.id,
              ...(product.expansionId === null ? {} : { expansionId: product.expansionId }),
              productName: cardnexusProductName(product),
              finish,
              prices,
            },
          ]
        : [];
    });
  });

  const reference = referenceOffer(offers);

  if (!reference) {
    return undefined;
  }

  return {
    cardId,
    source: "cardnexus",
    currency: CARDNEXUS_CURRENCY,
    prices: reference.prices,
    offers: [...offers].sort((a, b) => a.productId - b.productId || (a.finish ?? "").localeCompare(b.finish ?? "")),
    sourceUpdatedAt: sourceUpdatedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
