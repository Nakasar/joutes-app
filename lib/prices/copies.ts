import type { CardPriceOffer, CardPriceSource, CardPriceValues, CardPrintingPrice } from "@/lib/types/card-price";
import { cardPriceAmount, type MarketPrice } from "@/lib/prices/display";
import { referenceOffer } from "@/lib/prices/offers";

/**
 * Prix d'un exemplaire : celui de sa variante d'impression quand elle est cotée
 * à part, sinon celui de sa carte (cf. docs/CARD_PRICES.md).
 *
 * Module pur : les relevés sont lus par `lib/db/card-prices.ts`, qui s'en remet
 * ici pour choisir le montant.
 */

/** Ce qu'il faut d'un relevé pour en tirer un prix d'affichage. */
export type PriceRecord = {
  source: CardPriceSource;
  currency: string;
  prices: CardPriceValues;
  offers?: CardPriceOffer[];
  printings?: Record<string, CardPrintingPrice>;
  /** Date du relevé : un `Date` lu en base, sa forme ISO une fois sérialisé. */
  sourceUpdatedAt: Date | string;
};

/** Un exemplaire à chiffrer : sa carte, et sa variante s'il en a une. */
export type PricedCopy = {
  cardId: string;
  printingId?: string;
};

/**
 * Clé d'un exemplaire dans les prix rendus : la carte seule pour la version de
 * base, la carte et sa variante sinon.
 */
export function copyPriceKey(cardId: string, printingId?: string): string {
  return printingId ? `${cardId}#${printingId}` : cardId;
}

function toMarketPrice(record: PriceRecord, values: CardPriceValues, offers: CardPriceOffer[]): MarketPrice | undefined {
  const amount = cardPriceAmount(values);
  if (amount === undefined) {
    return undefined;
  }

  // Le montant vient du tirage le moins cher : c'est vers ce produit-là que le
  // lien renvoie, pas vers un autre tirage de la même carte.
  const productId = referenceOffer(offers)?.productId;

  return {
    amount,
    currency: record.currency,
    source: record.source,
    updatedAt: new Date(record.sourceUpdatedAt).toISOString(),
    ...(productId === undefined ? {} : { productId }),
  };
}

function orderedRecords(records: PriceRecord[], sources: readonly CardPriceSource[]): PriceRecord[] {
  return sources.flatMap((source) => records.filter((record) => record.source === source));
}

/**
 * Prix propre à une variante, sans repli sur celui de sa carte : ce que la
 * fiche d'une carte affiche sous chaque variante, là où un prix repris de la
 * carte ne dirait rien de plus que celui affiché au-dessus.
 */
export function printingMarketPrice(
  records: PriceRecord[],
  sources: readonly CardPriceSource[],
  printingId: string
): MarketPrice | undefined {
  for (const record of orderedRecords(records, sources)) {
    const printing = record.printings?.[printingId];
    const price = printing && toMarketPrice(record, printing.prices, printing.offers ?? []);
    if (price) {
      return price;
    }
  }

  return undefined;
}

/**
 * Prix d'affichage d'un exemplaire, parmi les relevés de sa carte.
 *
 * `sources` est l'ordre à suivre, du fournisseur préféré au dernier recours ;
 * un fournisseur absent de la liste n'est pas lu.
 *
 * La variante passe d'abord, quel que soit le fournisseur qui la cote : son
 * prix dit ce que vaut cet exemplaire-là, quand celui de la carte ne dit que ce
 * que vaut sa version de base. Une variante que personne ne cote à part prend
 * le prix de sa carte — c'est le cas de la plupart, et le seul prix qu'on leur
 * connaisse. Un relevé sans montant laisse la place au suivant.
 */
export function pickMarketPrice(
  records: PriceRecord[],
  sources: readonly CardPriceSource[],
  printingId?: string
): MarketPrice | undefined {
  const own = printingId ? printingMarketPrice(records, sources, printingId) : undefined;
  if (own) {
    return own;
  }

  for (const record of orderedRecords(records, sources)) {
    const price = toMarketPrice(record, record.prices, record.offers ?? []);
    if (price) {
      return price;
    }
  }

  return undefined;
}
