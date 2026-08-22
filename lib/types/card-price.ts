/**
 * Prix relevés sur une place de marché d'occasion.
 *
 * Un relevé est un instantané : il est réécrit à chaque import, il n'a pas
 * vocation à être exact à l'euro près ni à jour à la minute — cf.
 * docs/CARD_PRICES.md.
 */
export type CardPriceSource = "cardnexus" | "cardmarket";

/**
 * Les fournisseurs, du plus sûr au moins sûr. Une carte peut porter un relevé
 * de chacun ; c'est le premier de cette liste qui la représente à l'écran.
 *
 * CardNexus passe devant parce que son catalogue nomme l'extension et le
 * numéro de collection de chaque produit : ses prix sont rattachés à la bonne
 * carte par identité, là où ceux de Cardmarket le sont par un rapprochement de
 * noms qui, lui, peut se tromper (cf. docs/CARD_PRICES.md).
 */
export const CARD_PRICE_SOURCES: readonly CardPriceSource[] = ["cardnexus", "cardmarket"];

/**
 * Le fournisseur qu'un joueur veut voir représenter ses cartes.
 *
 * L'ordre ci-dessus est celui de la plateforme ; celui-ci est le sien. Les deux
 * ne se contredisent pas : une préférence n'est qu'un ordre substitué à
 * `CARD_PRICE_SOURCES`, que `orderedPriceSources` (`lib/prices/preference.ts`)
 * calcule et que la lecture des relevés prend déjà en paramètre.
 *
 * Sans préférence enregistrée, le joueur suit la plateforme — c'est le cas de
 * tous les comptes existants, et des visiteurs sans compte.
 */
export type CardPricePreference = {
  /** Fournisseur choisi ; absent, la plateforme choisit (`CARD_PRICE_SOURCES`). */
  source?: CardPriceSource;
  /**
   * Ce que devient une carte que le fournisseur choisi ne cote pas : un prix
   * d'un autre fournisseur (`true`, la valeur par défaut) ou aucun prix
   * (`false`).
   *
   * Le repli est le défaut parce que la couverture d'un fournisseur va de 95 %
   * à 9 % selon le jeu (cf. docs/CARD_PRICES.md) : sans lui, choisir un
   * fournisseur reviendrait souvent à vider la moitié des prix d'un jeu.
   */
  fallback?: boolean;
};

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
 *
 * CardNexus, lui, garde un seul produit et cote chacun de ses tirages à part :
 * un produit à deux tirages donne donc deux offres, qui portent le même
 * `productId` et diffèrent par leur `finish`.
 */
export type CardPriceOffer = {
  /** Identifiant du produit chez la place de marché (`idProduct`). */
  productId: number;
  /** Identifiant de son extension chez la place de marché (`idExpansion`). */
  expansionId?: number;
  /** Nom du produit tel que la place de marché l'écrit (`Savage Swing (Red)`). */
  productName: string;
  /**
   * Tirage coté, quand la place de marché les distingue (`Standard`, `Foil`).
   * Absent chez Cardmarket, dont les fichiers ne disent pas ce qu'est un
   * produit.
   */
  finish?: string;
  prices: CardPriceValues;
  /** Renseigné quand la place de marché cote le foil sur le même produit. */
  foilPrices?: CardPriceValues;
};

/**
 * Une carte de la plateforme telle qu'un import de prix la lit : son identité,
 * et les attributs dont le rapprochement a besoin. Partagée par les deux
 * fournisseurs, qui ne s'en servent pas de la même façon — CardNexus rapproche
 * par extension et numéro, Cardmarket par nom.
 */
export type PriceableCard = {
  /** Identifiant de la carte au sein du jeu (`WTR020`). */
  id: string;
  name: string;
  setCode?: string;
  /** Départage les variantes d'un même nom dans une extension (`027`, `027a`). */
  collectorNumber?: string;
  /** Attributs de jeu utiles au rapprochement (le pitch en Flesh and Blood). */
  [key: string]: unknown;
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
