/**
 * Rend une saisie inoffensive dans une expression régulière.
 *
 * Tout texte venu d'un champ de recherche passe par ici avant d'atteindre
 * `$regex` ou `new RegExp` : sans cela, la saisie *est* une expression. Un
 * `.*` élargit la recherche au-delà de ce que le filtre prévoyait, une
 * parenthèse ouvrante la fait échouer, et un motif à retours arrière
 * imbriqués occupe la base pour rien.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
