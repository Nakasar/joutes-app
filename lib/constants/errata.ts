/**
 * Règles d'un errata que d'autres modules doivent connaître sans rien traîner
 * avec elles.
 *
 * `lib/types/errata.ts` les portait ; il tire aujourd'hui le type d'une carte
 * de booster, donc celui d'un jeu, donc la moitié du domaine. Un script d'import
 * qui ne veut que la limite chargeait tout, et Node — qui retire les types sans
 * les résoudre — refusait au premier `import` d'un type écrit sans `type`. Les
 * constantes vivent donc ici, comme les autres constantes de règles du dossier,
 * et `lib/types/errata.ts` les republie pour ceux qui les y cherchent.
 */

/**
 * La création étant ouverte à tous, un errata ne peut pas viser une liste de
 * cartes arbitrairement longue (chaque carte entraîne une revalidation de page).
 */
export const MAX_ERRATA_CARDS = 20;
