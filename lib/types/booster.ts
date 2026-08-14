import {Game} from "@/lib/types/Game";
import {User} from "@/lib/types/User";
import {CardAttributes} from "@/lib/types/card";
import {CardMarketPrice} from "@/lib/prices/display";
import {ObjectId} from "bson";

export type BoosterCard = CardAttributes & {
  id: string;
  lang?: string;
  cardId?: string;
  boosterId?: string;
  name: string;
  subtitle?: string;
  setCode: string;
  collectorNumber: string;
  foil?: boolean;
  /** Variante d'impression de cet exemplaire ; absente = version de base. */
  printingId?: string;
  printingName?: string;
  image: string;
  price?: string;
  /** Prix de marché relevé pour la carte du catalogue (cf. docs/CARD_PRICES.md). */
  marketPrice?: CardMarketPrice;
  newInCollection?: boolean;
  banned?: boolean;
  text?: string;
};

export type BoosterCardDb = {
  boosterId?: ObjectId;
  fromBoosterId?: ObjectId;
  userId: ObjectId;
  cardId?: string;
  lang?: string;
  name: string;
  subtitle?: string;
  setCode: string;
  collectorNumber: string;
  foil?: boolean;
  printingId?: string;
  printingName?: string;
  image: string;
  price?: string;
  newInCollection?: boolean;
  banned?: boolean;
  language?: "FR" | "EN" | "ZH" | "IT" | "JA" | "KO";
  condition?: "Damaged" | "Played" | "Good" | "Near Mint" | "Mint";
  grade?: number;
  obtainedAt?: string;
  acquisitionPrice?: number;
  acquisitionCurrency?: "EUR" | "USD" | "GBP" | "JPY" | "CNY";
  borrowedBy?: string;
}

/**
 * Valeur d'un booster, calculée à la demande en additionnant le prix de ses
 * cartes. `pricedCards` dit sur combien de cartes elle repose : une valeur
 * portée par trois cartes sur douze ne se lit pas comme un total.
 */
export type BoosterValue = {
  amount: number;
  /** Devise ISO 4217 des montants (`EUR`). */
  currency: string;
  /** Cartes du booster au moment du calcul. */
  cardCount: number;
  /** Celles qui avaient un prix. */
  pricedCards: number;
  computedAt: string;
};

export type Booster = {
  gameId: Game['id'];
  game? : {
    id: Game['id'];
    slug?: string;
  };
  userId: User['id'];
  setCode: string;
  lang: string;
  type: string;
  id: string;
  cards: BoosterCard[];
  /** Note libre saisie par le propriétaire du booster. */
  note?: string;
  value?: string;
  /** Dernière valeur calculée à partir des prix des cartes. */
  estimatedValue?: BoosterValue;
  archived: boolean;
  addedToCollection?: boolean;
  createdAt: string;
};

export type BoosterDb = {
  gameId: ObjectId;
  userId: ObjectId;
  setCode: string;
  lang: string;
  type: string;
  note?: string;
  price?: string;
  estimatedValue?: Omit<BoosterValue, 'computedAt'> & { computedAt: Date };
  archived: boolean;
  addedToCollection?: boolean;
  createdAt: Date;
};
