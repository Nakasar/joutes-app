/**
 * Combien de listes de souhaits un propriétaire peut tenir.
 *
 * Module pur, sans base : la règle qui compte se prouve ici, et `lib/db` ne fait
 * que la consulter. Même découpage que `lib/trade/history.ts`.
 *
 * **Une seule liste sans abonnement, autant qu'on veut avec.** La gestion
 * avancée de collection arrive avec Joutes Expert ou Joutes Pro — et, pour un
 * groupe de jeu, il suffit qu'un seul de ses membres soit abonné.
 */

/** Nombre de listes de souhaits qu'un propriétaire sans abonnement peut tenir. */
export const FREE_WISHLIST_LIMIT = 1;

/**
 * Vrai si une liste de plus peut être créée.
 *
 * `advanced` dit si le propriétaire a la gestion avancée — pour un groupe, si
 * l'un de ses membres l'a.
 */
export function canCreateWishlist({
  existing,
  advanced,
}: {
  existing: number;
  advanced: boolean;
}): boolean {
  return advanced || existing < FREE_WISHLIST_LIMIT;
}

/**
 * La limite applicable, ou `null` quand il n'y en a pas.
 *
 * Sert à l'écrire dans l'interface plutôt qu'à décider : la décision est
 * `canCreateWishlist`, et un écran qui recalculerait le seuil à sa façon finirait
 * par ne plus dire la même chose que le serveur.
 */
export function wishlistLimitFor(advanced: boolean): number | null {
  return advanced ? null : FREE_WISHLIST_LIMIT;
}

/**
 * Vrai si ce propriétaire a atteint sa limite.
 *
 * Le pendant de `canCreateWishlist` pour l'affichage. **Supérieur ou égal**, et
 * non l'égalité : un compte qui possédait déjà plusieurs listes avant que la
 * limite n'existe les garde toutes — on ne supprime rien —, il ne peut
 * simplement plus en ajouter.
 */
export function hasReachedWishlistLimit({
  existing,
  advanced,
}: {
  existing: number;
  advanced: boolean;
}): boolean {
  return !canCreateWishlist({ existing, advanced });
}
