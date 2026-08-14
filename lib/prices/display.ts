import type { CardPriceValues } from "@/lib/types/card-price";

/**
 * Prix d'une carte tel que l'interface le montre : un seul montant, sa devise,
 * et la date à laquelle la place de marché l'a calculé.
 *
 * Les relevés en portent bien plus (prix bas, moyen, tendance, moyennes
 * glissantes, un jeu de valeurs par tirage — cf. docs/CARD_PRICES.md), mais à
 * côté du nom d'une carte, dans une grille, il n'y a la place que pour un
 * chiffre.
 */
export type CardMarketPrice = {
  amount: number;
  /** Devise ISO 4217 (`EUR`). */
  currency: string;
  /** Date du relevé de la place de marché, pas celle de l'affichage. */
  updatedAt: string;
  /** Produit de la place de marché d'où vient le montant, pour y renvoyer. */
  productId?: number;
};

/**
 * Le montant qui représente la carte : sa tendance, le prix lissé par la place
 * de marché. À défaut — une carte trop peu vendue pour être située —, le prix
 * de l'offre la moins chère, puis la moyenne de ses ventes. Rien de tout cela,
 * et la carte n'a pas de prix à montrer.
 */
export function cardPriceAmount(prices: CardPriceValues): number | undefined {
  return prices.trend ?? prices.low ?? prices.avg;
}

/**
 * Somme des prix d'un lot de cartes — la valeur d'un booster, demain celle
 * d'une collection.
 *
 * `priced` compte les cartes qui ont contribué : c'est ce qui distingue un
 * booster à 3 € d'un booster dont trois cartes sur douze seulement ont un
 * prix, et sans lui le total se lirait comme une valeur complète.
 *
 * Les devises ne s'additionnent pas : si le lot en mélange plusieurs — ce
 * qu'aucune place de marché ne produit aujourd'hui —, seule la plus répandue
 * est retenue, les autres comptant comme des cartes sans prix.
 */
export function sumCardPrices(prices: (CardMarketPrice | undefined)[]): {
  amount: number;
  currency: string;
  priced: number;
} | undefined {
  const known = prices.filter((price): price is CardMarketPrice => price !== undefined);

  if (known.length === 0) {
    return undefined;
  }

  const counts = new Map<string, number>();
  for (const price of known) {
    counts.set(price.currency, (counts.get(price.currency) ?? 0) + 1);
  }
  const [currency] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  const kept = known.filter((price) => price.currency === currency);
  // Les montants sont des décimaux à deux chiffres : les additionner en
  // virgule flottante laisse des traînées (0,1 + 0,2), arrondies ici.
  const amount = Math.round(kept.reduce((total, price) => total + price.amount, 0) * 100) / 100;

  return { amount, currency, priced: kept.length };
}

/**
 * Montant dans la langue de l'utilisateur (`1,29 €`, `€1.29`). Une devise
 * inconnue de l'environnement ne doit pas faire tomber la page : le montant
 * est alors affiché tel quel, suivi de son code.
 */
export function formatCardPrice(price: CardMarketPrice, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(price.amount);
  } catch {
    return `${price.amount} ${price.currency}`;
  }
}
