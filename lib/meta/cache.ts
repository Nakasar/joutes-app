/**
 * L'étiquette de cache des statistiques de la méta d'un jeu.
 *
 * Toute écriture qui change l'échantillon (import, marquage, retrait, réglages)
 * l'invalide avec `updateTag`, pour que la page Méta la reflète dès la requête
 * suivante.
 */
export function metaCacheTag(gameId: string): string {
  return `meta:${gameId}`;
}
