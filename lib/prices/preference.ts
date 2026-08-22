import { cardPriceAmount } from "@/lib/prices/display";
import {
  CARD_PRICE_SOURCES,
  type CardPrice,
  type CardPricePreference,
  type CardPriceSource,
} from "@/lib/types/card-price";

/**
 * La préférence d'un joueur, ramenée à ce que la lecture des relevés sait déjà
 * faire : un ordre de fournisseurs.
 *
 * `getMarketPrices` et `getCardPricesByCardId` choisissent carte par carte le
 * premier fournisseur de la liste qui en a un ; toute la préférence tient donc
 * dans la liste qu'on leur passe, et rien n'a à savoir qu'un joueur est
 * derrière — cf. docs/CARD_PRICES.md.
 */
export function orderedPriceSources(preference?: CardPricePreference): readonly CardPriceSource[] {
  const chosen = preference?.source;

  // Un fournisseur retiré de la plateforme laisse des préférences qui le
  // nomment encore : elles retombent sur l'ordre de la plateforme plutôt que
  // de vider les prix de ceux qui l'avaient choisi.
  if (!chosen || !CARD_PRICE_SOURCES.includes(chosen)) {
    return CARD_PRICE_SOURCES;
  }

  if (preference?.fallback === false) {
    return [chosen];
  }

  return [chosen, ...CARD_PRICE_SOURCES.filter((source) => source !== chosen)];
}

/**
 * Le fournisseur que le joueur a choisi, une fois écarté ce qui n'en est plus
 * un : c'est lui que l'écran nomme (« Cardmarket, votre source, n'a pas relevé
 * cette carte »).
 *
 * `orderedPriceSources` écarte déjà un fournisseur inconnu du calcul ; sans le
 * même filtre ici, l'écran nommerait un fournisseur que la plateforme ne
 * connaît plus — et, faute de libellé, écrirait « undefined ».
 */
export function chosenPriceSource(preference?: CardPricePreference): CardPriceSource | undefined {
  const chosen = preference?.source;

  return chosen && CARD_PRICE_SOURCES.includes(chosen) ? chosen : undefined;
}

/**
 * Le relevé qui représente la carte parmi ceux qu'elle porte : le premier de
 * `sources` qui annonce un montant.
 *
 * Un relevé sans montant ne compte pas comme une réponse — c'est la règle de
 * `getMarketPrices`, reprise ici pour que la fiche d'une carte montre en grand
 * le même montant que sa vignette dans une grille.
 *
 * `undefined` quand aucun ne convient : le fournisseur choisi ne cote pas la
 * carte et le joueur a refusé le repli. La fiche le dit alors, plutôt que de
 * remonter un prix qu'il ne veut pas.
 */
export function referenceCardPrice(
  prices: CardPrice[],
  sources: readonly CardPriceSource[]
): CardPrice | undefined {
  for (const source of sources) {
    const price = prices.find(
      (candidate) => candidate.source === source && cardPriceAmount(candidate.prices) !== undefined
    );

    if (price) {
      return price;
    }
  }

  return undefined;
}

/**
 * Les autres relevés de la carte, dans l'ordre de la plateforme.
 *
 * Ils s'affichent tous, y compris celui d'un fournisseur que le joueur n'a pas
 * choisi et celui d'un relevé sans montant : la fiche est le seul écran qui
 * dise ce qui existe, et une place de marché qui suit une carte sans savoir la
 * situer est une information — pas un vide.
 */
export function otherCardPrices(prices: CardPrice[], reference: CardPrice | undefined): CardPrice[] {
  const rank = (price: CardPrice) => {
    const index = CARD_PRICE_SOURCES.indexOf(price.source);
    return index < 0 ? CARD_PRICE_SOURCES.length : index;
  };

  return prices
    .filter((price) => price.source !== reference?.source)
    .sort((left, right) => rank(left) - rank(right));
}
