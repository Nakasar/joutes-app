/**
 * Catalogue et prix de CardNexus.
 *
 * CardNexus est une place de marché qui publie, sous clé d'API, trois « feeds »
 * par jeu : ses extensions, son catalogue de produits et les prix courants de
 * chacun (https://docs.cardnexus.com/feeds). Chaque feed est un fichier NDJSON
 * gzippé, téléchargé par un lien signé et à durée limitée qu'il faut demander à
 * l'API.
 *
 * Ce que CardNexus apporte que Cardmarket n'a pas : son catalogue **nomme
 * l'extension et le numéro de collection** de chaque produit. Une carte s'y
 * retrouve donc par identité — extension et numéro — au lieu d'un rapprochement
 * de noms, et ses tirages (`Standard`, `Foil`…) y sont cotés séparément au lieu
 * d'être des produits que rien ne distingue. Cf. docs/CARD_PRICES.md.
 *
 * Ce module est celui que le navigateur peut charger : il ne contient que des
 * constantes, des types et la construction d'une URL. Le téléchargement des
 * feeds vit dans `cardnexus-feed.ts`, qui, lui, ouvre des flux gzip.
 */

/**
 * Identifiant CardNexus des jeux de la plateforme, par slug de jeu. Un jeu
 * absent de cette table n'a pas de prix CardNexus : rien ne permet de deviner
 * son identifiant, et se tromper importerait les prix d'un autre jeu.
 *
 * La liste à jour se lit sur `GET /v1/games`. Yu-Gi-Oh n'y figure pas — d'où
 * son absence ici, quand `CARDMARKET_GAME_IDS` le connaît.
 */
export const CARDNEXUS_GAME_IDS: Record<string, string> = {
  mtg: "mtg",
  pokemon: "pokemon",
  fab: "fab",
  op: "onepiece",
  lorcana: "lorcana",
  swu: "swu",
  riftbound: "riftbound",
};

/**
 * Devise des relevés CardNexus.
 *
 * Le feed cote chaque tirage jusqu'à trois fois : l'instantané quotidien de
 * Cardmarket (en euros), celui de TCGplayer (en dollars) et les annonces vivant
 * sur la place de marché CardNexus (converties en euros). Nos relevés ne
 * portent qu'une devise, et l'application compte en euros : seules les valeurs
 * en euros sont retenues, celles de TCGplayer sont laissées de côté.
 */
export const CARDNEXUS_CURRENCY = "EUR";

/**
 * Page d'un produit sur CardNexus.
 *
 * CardNexus construit l'adresse d'un produit avec des segments lisibles —
 * jeu, extension, nom — mais ne se sert que de l'identifiant qui termine le
 * dernier segment : toute autre adresse de la même forme y est redirigée
 * (308). Nos relevés ne portent que cet identifiant, d'où les segments
 * neutres ; c'est la même mécanique que `Products?idProduct=` chez Cardmarket.
 *
 * Un jeu absent de `CARDNEXUS_GAME_IDS` n'a pas de lien, plutôt qu'un lien
 * vers une page qui n'existe pas.
 */
export function cardnexusProductUrl(gameSlug: string | undefined, productId: number | undefined): string | undefined {
  const gameId = gameSlug ? CARDNEXUS_GAME_IDS[gameSlug] : undefined;

  if (!gameId || productId === undefined) {
    return undefined;
  }

  return `https://cardnexus.com/en/explore/${gameId}/card/card/card-${productId}`;
}

/** Une ligne du feed des extensions. */
export type CardnexusExpansion = {
  id: number;
  name: string;
  slug: string;
  /** Code d'extension de l'éditeur (`LEA`, `OGN`), quand CardNexus le connaît. */
  code: string | null;
  releaseDate?: string | null;
};

/** Une ligne du feed du catalogue : un produit, carte ou produit scellé. */
export type CardnexusProduct = {
  id: number;
  productType: "card" | "sealed" | string;
  name: string;
  nameSlug: string;
  slug: string;
  expansionId: number | null;
  expansionSlug: string | null;
  /** Numéro de collection dans l'extension. */
  printNumber: string | null;
  /** Étiquette de variante, quand le produit est la variante d'un autre tirage. */
  variant: string | null;
  rarity?: string | null;
  finishes?: string[];
  languages?: string[];
  translations?: Record<string, { name?: string }> | null;
};

/**
 * L'instantané quotidien d'une place de marché tierce, pour un tirage. Les
 * montants sont en unités majeures (`38.90` vaut 38,90 €) et absents quand la
 * place de marché ne sait pas.
 */
export type CardnexusMarketplacePrices = {
  currency: string;
  low?: number;
  mid?: number;
  high?: number;
  /** Prix agrégé, celui que CardNexus affiche comme prix de la carte. */
  marketValue?: number;
  /** Jour de l'instantané (`2026-06-10`). */
  date?: string;
};

/** Les annonces vivantes sur la place de marché CardNexus, pour un tirage. */
export type CardnexusListingPrices = {
  /** Annonce la moins chère, convertie en euros au moment du feed. */
  low?: { amount: number; currency: string };
  listingCount?: number;
  availableQuantity?: number;
};

export type CardnexusFinishPrices = {
  cardmarket?: CardnexusMarketplacePrices;
  tcgplayer?: CardnexusMarketplacePrices;
  cardnexus?: CardnexusListingPrices;
};

/** Une ligne du feed des prix : un produit, ses tirages, leurs prix. */
export type CardnexusPriceRecord = {
  productId: number;
  pricesByFinish?: Record<string, CardnexusFinishPrices>;
};

/** Métadonnées d'un feed : où le télécharger, et de quand il date. */
export type CardnexusFeedMetadata = {
  feedType: "catalog" | "expansions" | "prices" | string;
  /** Lien signé, valable jusqu'à `urlExpiresAt`. */
  url: string;
  urlExpiresAt: string;
  /** SHA-256 du contenu décompressé : il ne bouge que si le contenu bouge. */
  checksum: string;
  sizeBytes: number;
  recordCount: number;
  format: string;
  encoding: string;
  /** Dernière reconstruction, même à contenu identique. */
  lastRefreshedAt: string;
  /** Dernier changement de contenu — c'est de ce jour que datent les prix. */
  generatedAt: string;
};

/** Les trois feeds d'un jeu. */
export type CardnexusFeeds = {
  catalog: CardnexusFeedMetadata;
  expansions: CardnexusFeedMetadata;
  prices: CardnexusFeedMetadata;
};
