/**
 * Robots refusés sur les pages de méta (`/games/:jeu/meta…`).
 *
 * Chaque adresse de la méta recalcule les statistiques, et ses filtres se
 * combinent sans fin : PerplexityBot en a tiré 117 000 en deux jours (9-10 nov.
 * 2026, ~15 Go sortis de nos fonctions). `robots.txt` n'est qu'une consigne
 * relue avec retard ; ce refus s'applique tout de suite, dans le proxy, avant
 * tout rendu. Kevin a demandé d'écarter tous les robots de ces pages.
 */

/** `/games/:jeu/meta` et ses sous-pages, avec ou sans préfixe de langue. */
const META_PATH = /^\/(?:[a-z]{2}\/)?games\/[^/]+\/meta(?:\/|$)/;

/**
 * Agents de robots connus. Large à dessein : un faux positif ne prive qu'un
 * robot d'une page de statistiques, un faux négatif coûte des gigaoctets.
 */
const BOT_USER_AGENT =
  /bot\b|bot\/|crawl|spider|slurp|scrap|perplexity|seranking|facebookexternalhit|headlesschrome|python-requests|curl\/|wget\//i;

export function isMetaPath(pathname: string): boolean {
  return META_PATH.test(pathname);
}

export function isBotUserAgent(userAgent: string | null): boolean {
  return !userAgent || BOT_USER_AGENT.test(userAgent);
}

/** Vrai si la requête est celle d'un robot vers une page de méta. */
export function isBlockedMetaBot(pathname: string, userAgent: string | null): boolean {
  return isMetaPath(pathname) && isBotUserAgent(userAgent);
}
