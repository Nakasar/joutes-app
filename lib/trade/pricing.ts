import type { CardMarketPrice } from "@/lib/prices/display";

/**
 * Chiffrage d'un échange.
 *
 * Chaque carte vaut le prix que son propriétaire a décidé, à défaut son prix de
 * marché relevé (cf. docs/CARD_PRICES.md). Une carte sans l'un ni l'autre ne
 * vaut pas zéro : elle n'entre pas dans le total, et l'écran dit combien il en
 * reste dehors — sans quoi deux offres se compareraient sur des bases
 * différentes sans que rien ne le signale.
 */

export type PricedTradeCard = {
  quantity: number;
  /** Prix décidé par le propriétaire de la face, à l'unité. */
  unitPrice?: number;
  marketPrice?: CardMarketPrice;
};

export type TradeSideTotal = {
  amount: number;
  currency?: string;
  /** Exemplaires (et non lignes) qui portent le total. */
  pricedCopies: number;
  /** Exemplaires laissés dehors, faute de prix. */
  unpricedCopies: number;
};

/** Prix appliqué à une carte : celui qui a été décidé, sinon celui du marché. */
export function appliedUnitPrice(card: PricedTradeCard): number | undefined {
  return card.unitPrice ?? card.marketPrice?.amount;
}

/** Vrai quand le prix appliqué s'écarte du prix de marché — un prix négocié. */
export function isNegotiatedPrice(card: PricedTradeCard): boolean {
  return card.unitPrice !== undefined && card.unitPrice !== card.marketPrice?.amount;
}

function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Total d'une face : la somme des prix appliqués, exemplaire par exemplaire. */
export function sideTotal(cards: PricedTradeCard[], fallbackCurrency: string): TradeSideTotal {
  let amount = 0;
  let pricedCopies = 0;
  let unpricedCopies = 0;
  let currency: string | undefined;

  for (const card of cards) {
    const unit = appliedUnitPrice(card);

    if (unit === undefined) {
      unpricedCopies += card.quantity;
      continue;
    }

    amount += unit * card.quantity;
    pricedCopies += card.quantity;
    currency = currency ?? card.marketPrice?.currency;
  }

  return {
    amount: round(amount),
    currency: pricedCopies > 0 ? currency ?? fallbackCurrency : undefined,
    pricedCopies,
    unpricedCopies,
  };
}

/**
 * Écart entre les deux faces, du point de vue de la première : positif, elle
 * donne plus qu'elle ne reçoit.
 */
export function tradeDifference(mine: TradeSideTotal, theirs: TradeSideTotal): number {
  return round(mine.amount - theirs.amount);
}
