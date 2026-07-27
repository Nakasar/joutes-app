export type CubeVisibility = "private" | "unlisted" | "public";

export type Cube = {
  id: string;
  ownerId: string;
  gameId: string;
  gameName?: string;
  gameSlug?: string;
  name: string;
  description?: string;
  visibility: CubeVisibility;
  packsCount: number;
  cardsCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Un paquet regroupe des cartes dans un cube. Nom et type sont libres : un cube
 * peut être une simple liste de paquets numérotés comme un ensemble de paquets
 * thématiques nommés.
 */
export type CubePack = {
  id: string;
  cubeId: string;
  name?: string;
  type?: string;
  cardsCount: number;
  createdAt: Date;
};

/**
 * Les entrées ne portent que l'identité d'une carte : les propriétés de jeu
 * (rareté, domaine, type…) sont relues depuis `cards` au moment des
 * statistiques, comme pour les boosters.
 */
export type CubeCard = {
  id: string;
  cubeId: string;
  packId: string;
  cardId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  createdAt: Date;
};
