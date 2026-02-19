export type DeckVisibility = "private" | "public";

export type Deck = {
  id: string;
  playerId: string;
  gameId: string;
  name: string;
  url?: string;
  description?: string;
  decklist?: string;
  visibility: DeckVisibility;
  createdAt: Date;
  updatedAt: Date;
};
