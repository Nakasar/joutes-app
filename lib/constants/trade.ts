/** Bornes d'un échange, partagées par le serveur, la validation Zod et l'UI. */

/** Nombre maximal de cartes distinctes par face d'un échange. */
export const TRADE_MAX_CARDS_PER_SIDE = 50;

/** Nombre maximal d'exemplaires d'une même carte dans une offre. */
export const TRADE_MAX_QUANTITY = 99;

/** Le catalogue couvre tous les jeux : une recherche plus courte n'est pas exécutée. */
export const TRADE_CATALOG_MIN_QUERY = 2;
