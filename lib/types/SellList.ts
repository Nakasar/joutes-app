export type SellListOwnerType = "user" | "playGroup";

export type SellListCondition = "Damaged" | "Played" | "Good" | "Near Mint" | "Mint";
export type SellListLanguage = "FR" | "EN" | "ZH" | "IT" | "JA" | "KO";
export type SellListCurrency = "EUR" | "USD" | "GBP" | "JPY" | "CNY";

export type SellList = {
  id: string;
  ownerType: SellListOwnerType;
  ownerId: string;
  description?: string;
  itemsCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SellListItem = {
  id: string;
  sellListId: string;
  collectionEntryId: string;
  cardId: string;
  gameId: string;
  gameName?: string;
  gameSlug?: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  type?: string;
  foil?: boolean;
  language?: SellListLanguage;
  condition?: SellListCondition;
  grade?: number;
  /** Optional: a seller can list a card for sale without stating a price. */
  price?: number;
  currency?: SellListCurrency;
  note?: string;
  /** Which member listed this item — mainly meaningful for play-group sell lists. */
  addedByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
};
