export type WishlistVisibility = "private" | "unlisted" | "public";

export type WishlistOwnerType = "user" | "playGroup";

export type Wishlist = {
  id: string;
  name: string;
  description?: string;
  ownerType: WishlistOwnerType;
  ownerId: string;
  visibility: WishlistVisibility;
  itemsCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type WishlistItem = {
  id: string;
  wishlistId: string;
  cardId: string;
  gameId: string;
  gameName?: string;
  gameSlug?: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  type?: string;
  quantity: number;
  note?: string;
  /** Which member added this item — mainly meaningful for play-group wishlists. */
  addedByUserId?: string;
  createdAt: Date;
  /** How many copies of this card the *viewing* user personally owns — only computed when the viewer is logged in. */
  ownedQuantity?: number;
};
