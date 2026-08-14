/**
 * Catalogue et prix publics de Cardmarket.
 *
 * Cardmarket publie deux fichiers par jeu, en accès libre et sans compte
 * (https://www.cardmarket.com/Data/Download) : la liste de ses produits et son
 * guide des prix, ce dernier recalculé une fois par jour. Ce sont les deux
 * seules sources utilisées — le site lui-même est derrière Cloudflare et son
 * API demande un compte applicatif que Cardmarket n'ouvre plus.
 *
 * Les deux fichiers se joignent par `idProduct`. Le guide des prix couvre tous
 * les produits du jeu (cartes à l'unité, boosters, displays…), la liste ne
 * porte que les cartes à l'unité : c'est elle qui borne ce qu'on importe.
 */

const DOWNLOADS = "https://downloads.s3.cardmarket.com/productCatalog";

/**
 * Identifiant Cardmarket des jeux de la plateforme, par slug de jeu. Un jeu
 * absent de cette table n'a pas de prix : rien ne permet de deviner son
 * identifiant, et se tromper d'identifiant importerait les prix d'un autre jeu.
 */
export const CARDMARKET_GAME_IDS: Record<string, number> = {
  mtg: 1,
  yugioh: 3,
  pokemon: 6,
  fab: 16,
  op: 18,
  lorcana: 19,
  swu: 21,
  riftbound: 22,
};

/**
 * Segment d'URL du jeu chez Cardmarket, par slug de jeu. Il ne se devine pas
 * (`fab` s'y écrit `FleshAndBlood`) : un jeu absent de cette table n'a pas de
 * lien, plutôt qu'un lien vers une page qui n'existe pas.
 */
export const CARDMARKET_GAME_PATHS: Record<string, string> = {
  mtg: "Magic",
  fab: "FleshAndBlood",
  riftbound: "Riftbound",
  swu: "StarWarsUnlimited",
};

/**
 * Page d'un produit sur Cardmarket.
 *
 * Cardmarket redirige `Products?idProduct=<id>` vers la fiche du produit, en
 * s'appuyant sur l'identifiant de son catalogue public — celui-là même que nos
 * relevés portent. C'est la forme que Scryfall publie dans ses
 * `purchase_uris`, et la seule qui se construise sans connaître le nom de
 * l'extension ni celui de la carte chez eux.
 */
export function cardmarketProductUrl(gameSlug: string | undefined, productId: number | undefined): string | undefined {
  const path = gameSlug ? CARDMARKET_GAME_PATHS[gameSlug] : undefined;

  if (!path || productId === undefined) {
    return undefined;
  }

  return `https://www.cardmarket.com/en/${path}/Products?idProduct=${productId}`;
}

/** Devise des montants publiés par Cardmarket. */
export const CARDMARKET_CURRENCY = "EUR";

export type CardmarketProduct = {
  idProduct: number;
  name: string;
  idCategory: number;
  categoryName: string;
  idExpansion: number;
  idMetacard: number;
  dateAdded: string;
};

/**
 * Une ligne du guide des prix. Les clés suffixées `-foil` ne sont renseignées
 * que lorsque Cardmarket cote le foil sur le même produit ; pour les jeux qui
 * vendent le foil comme un produit à part (Flesh and Blood), elles sont nulles.
 */
export type CardmarketPriceGuide = {
  idProduct: number;
  idCategory: number;
  avg: number | null;
  low: number | null;
  trend: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
  "avg-foil": number | null;
  "low-foil": number | null;
  "trend-foil": number | null;
  "avg1-foil": number | null;
  "avg7-foil": number | null;
  "avg30-foil": number | null;
};

type ProductFile = { version: number; createdAt: string; products: CardmarketProduct[] };
type PriceGuideFile = { version: number; createdAt: string; priceGuides: CardmarketPriceGuide[] };

/** Décalage horaire écrit sans deux-points, à la fin d'une date. */
const COMPACT_OFFSET = /([+-]\d{2})(\d{2})$/;

/**
 * Date de fabrication d'un fichier Cardmarket (`2026-08-14T02:43:53+0200`).
 *
 * Le décalage horaire y est écrit sans deux-points, ce que la norme ne prévoit
 * pas : les moteurs le lisent aujourd'hui, mais rien ne les y oblige. Il est
 * donc remis en forme, et une date illisible arrête l'import — mieux vaut ça
 * qu'un `Invalid Date` propagé jusqu'aux relevés écrits en base.
 */
export function parseCardmarketDate(value: string): Date {
  const date = new Date(value.replace(COMPACT_OFFSET, "$1:$2"));

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Date Cardmarket illisible : « ${value} ».`);
  }

  return date;
}

/**
 * Les fichiers pèsent quelques mégaoctets et sont servis par un stockage
 * d'objets : un incident réseau isolé ne doit pas perdre l'import entier.
 */
async function fetchJson<T>(url: string, attempt = 1): Promise<T> {
  const MAX_ATTEMPTS = 4;

  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} sur ${url}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    return fetchJson<T>(url, attempt + 1);
  }
}

/** Cartes à l'unité d'un jeu, sans les produits scellés. */
export async function fetchCardmarketProducts(gameId: number): Promise<ProductFile> {
  return fetchJson<ProductFile>(`${DOWNLOADS}/productList/products_singles_${gameId}.json`);
}

/** Guide des prix d'un jeu, tous produits confondus. */
export async function fetchCardmarketPriceGuide(gameId: number): Promise<PriceGuideFile> {
  return fetchJson<PriceGuideFile>(`${DOWNLOADS}/priceGuide/price_guide_${gameId}.json`);
}
