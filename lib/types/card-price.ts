/**
 * Prix relevés sur une place de marché d'occasion (Cardmarket pour l'instant).
 *
 * Un relevé est un instantané : il est réécrit à chaque import, il n'a pas
 * vocation à être exact à l'euro près ni à jour à la minute — cf.
 * docs/CARD_PRICES.md.
 */
export type CardPriceSource = "cardmarket";

/**
 * Les valeurs d'une place de marché, dans sa devise. Toutes facultatives :
 * une carte sans vente récente n'a ni moyenne ni tendance, et une carte
 * jamais mise en vente n'a aucune valeur du tout.
 */
export type CardPriceValues = {
  /** Offre la moins chère au moment du relevé. */
  low?: number;
  /** Moyenne des ventes de toute l'histoire de la carte. */
  avg?: number;
  /** Prix de tendance calculé par la place de marché. */
  trend?: number;
  /** Moyennes glissantes sur 1, 7 et 30 jours. */
  avg1?: number;
  avg7?: number;
  avg30?: number;
};

/**
 * Un produit de la place de marché rattaché à la carte. Une même carte en a
 * souvent plusieurs : Cardmarket sépare les tirages (normal, rainbow foil,
 * cold foil) et les éditions (première édition, Unlimited) en produits
 * distincts, là où l'application n'a qu'une carte par numéro de collection.
 */
export type CardPriceOffer = {
  /** Identifiant du produit chez la place de marché (`idProduct`). */
  productId: number;
  /** Identifiant de son extension chez la place de marché (`idExpansion`). */
  expansionId: number;
  /** Nom du produit tel que la place de marché l'écrit (`Savage Swing (Red)`). */
  productName: string;
  prices: CardPriceValues;
  /** Renseigné quand la place de marché cote le foil sur le même produit. */
  foilPrices?: CardPriceValues;
};

export type CardPrice = {
  /** Identifiant de la carte au sein du jeu (`WTR020`). */
  cardId: string;
  source: CardPriceSource;
  /** Devise ISO 4217 des montants (`EUR` chez Cardmarket). */
  currency: string;
  /**
   * Prix de référence de la carte : celui du tirage le moins cher parmi les
   * produits retenus. C'est le prix « à partir de » de la carte, sans le
   * surcoût des versions foil ou première édition.
   */
  prices: CardPriceValues;
  offers: CardPriceOffer[];
  /** Date du fichier de la place de marché, pas celle de l'import. */
  sourceUpdatedAt: string;
  updatedAt: string;
};
