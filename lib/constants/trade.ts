/** Bornes d'un échange, partagées par le serveur, la validation Zod et l'UI. */

/** Nombre maximal de cartes distinctes par face d'un échange. */
export const TRADE_MAX_CARDS_PER_SIDE = 50;

/** Nombre maximal d'exemplaires d'une même carte dans une offre. */
export const TRADE_MAX_QUANTITY = 99;

/**
 * Prix négocié maximal d'une carte, à l'unité. Une borne de garde : elle ne
 * décrit aucune carte réelle, elle empêche seulement qu'un chiffre saisi de
 * travers ne devienne un total absurde.
 */
export const TRADE_MAX_UNIT_PRICE = 100000;

/** Le catalogue couvre tous les jeux : une recherche plus courte n'est pas exécutée. */
export const TRADE_CATALOG_MIN_QUERY = 2;
