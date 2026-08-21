import type { MarketPrice } from "@/lib/prices/display";

/**
 * Valeur d'une collection : ce qu'elle vaudrait au prix du marché de
 * l'occasion, exemplaire par exemplaire.
 *
 * C'est un ordre de grandeur, pas une estimation d'assurance : les prix ne
 * sont relevés que de temps en temps, ils ne valent que pour l'édition
 * anglaise, et toutes les cartes n'en ont pas (cf. docs/CARD_PRICES.md). D'où
 * `pricedCopies` : une valeur portée par deux cents exemplaires sur mille ne se
 * lit pas comme le prix de la collection.
 *
 * Un exemplaire vaut le prix de sa carte au catalogue, quel que soit son état,
 * sa langue ou son tirage : les relevés ne distinguent pas les impressions, et
 * inventer une décote au foil ou à l'abîmé serait une invention.
 *
 * Module pur : ni base ni prix à lire, juste l'addition et ce qu'elle emporte.
 */
export type CollectionValue = {
  amount: number;
  /** Devise ISO 4217 des montants (`EUR`). */
  currency: string;
  /** Exemplaires possédés au moment du calcul. */
  copies: number;
  /** Ceux qui portaient un prix, et ont donc compté. */
  pricedCopies: number;
  computedAt: string;
};

/** Valeur de toute la collection : la somme des valeurs par jeu. */
export type CollectionValueTotal = CollectionValue & {
  /** Jeux dont une valeur est enregistrée et entre dans ce total. */
  games: number;
};

/** Devise retenue quand rien n'a de prix — celle des relevés. */
const DEFAULT_CURRENCY = "EUR";

/**
 * Devise majoritaire d'un lot de montants. Les devises ne s'additionnent pas :
 * si le lot en mélange plusieurs — ce qu'aucune place de marché ne produit
 * aujourd'hui —, seule la plus répandue est retenue, les autres comptant comme
 * des exemplaires sans prix.
 */
function dominantCurrency(counts: Map<string, number>): string | undefined {
  const [best] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return best?.[0];
}

/**
 * Valeur des exemplaires possédés d'un jeu : chaque carte compte autant de fois
 * qu'on en possède d'exemplaires.
 *
 * Une carte sans relevé n'ajoute rien et n'est pas comptée parmi les
 * exemplaires cotés — elle ne vaut pas zéro, on ignore ce qu'elle vaut.
 */
export function sumOwnedCardPrices(
  entries: { copies: number; price?: MarketPrice }[],
  computedAt: Date
): CollectionValue {
  const copies = entries.reduce((total, entry) => total + entry.copies, 0);

  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.price) {
      counts.set(entry.price.currency, (counts.get(entry.price.currency) ?? 0) + entry.copies);
    }
  }
  const currency = dominantCurrency(counts) ?? DEFAULT_CURRENCY;

  let amount = 0;
  let pricedCopies = 0;
  for (const entry of entries) {
    if (entry.price?.currency === currency) {
      amount += entry.price.amount * entry.copies;
      pricedCopies += entry.copies;
    }
  }

  return {
    // Les montants sont des décimaux à deux chiffres : les additionner en
    // virgule flottante laisse des traînées (0,1 + 0,2), arrondies ici.
    amount: Math.round(amount * 100) / 100,
    currency,
    copies,
    pricedCopies,
    computedAt: computedAt.toISOString(),
  };
}

/**
 * Total d'une collection à partir des valeurs enregistrées par jeu.
 *
 * Le total n'est pas stocké : il se déduit de ce qui l'est, et deux nombres
 * qu'on écrit séparément finissent toujours par se contredire — un jeu
 * recalculé seul laisserait un total périmé qui, lui, ne dirait pas qu'il l'est.
 *
 * `computedAt` est la **plus ancienne** des dates : un total ne peut pas être
 * plus frais que le plus vieux des calculs dont il est fait.
 */
export function totalCollectionValue(values: CollectionValue[]): CollectionValueTotal | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value.currency, (counts.get(value.currency) ?? 0) + value.pricedCopies);
  }
  // Un jeu sans aucun exemplaire coté ne pèse rien dans ce choix : sa devise
  // est celle par défaut, pas une devise constatée.
  const currency = dominantCurrency(counts) ?? values[0].currency;

  const kept = values.filter((value) => value.currency === currency);

  return {
    amount: Math.round(kept.reduce((total, value) => total + value.amount, 0) * 100) / 100,
    currency,
    copies: kept.reduce((total, value) => total + value.copies, 0),
    pricedCopies: kept.reduce((total, value) => total + value.pricedCopies, 0),
    computedAt: kept.reduce(
      (oldest, value) => (value.computedAt < oldest ? value.computedAt : oldest),
      kept[0].computedAt
    ),
    games: kept.length,
  };
}
