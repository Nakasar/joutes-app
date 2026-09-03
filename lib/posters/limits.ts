/**
 * Combien d'affiches un joueur peut garder.
 *
 * Module pur, sans base : la règle qui compte se prouve ici, et `lib/db` ne
 * fait que la consulter. Même découpage que `lib/wishlists/limits.ts`, dont
 * cette règle est la jumelle — et la même raison de l'écrire à part.
 *
 * **Une affiche sans abonnement, autant qu'on veut avec.** Composer une
 * affiche reste libre : c'est la garder qui demande Joutes Expert ou Joutes
 * Pro au-delà de la première. Une affiche n'est qu'une poignée d'identifiants,
 * mais en garder une collection est le confort qu'on achète.
 */

/** Nombre d'affiches qu'un compte sans abonnement peut garder. */
export const FREE_POSTER_LIMIT = 1;

/** Le nom d'une affiche enregistrée : assez pour « Mes boutiques du jeudi ». */
export const MAX_POSTER_NAME = 60;

/**
 * Vrai si une affiche de plus peut être enregistrée.
 *
 * `unlimited` dit si le compte tient le droit d'en garder plusieurs.
 */
export function canSavePoster({ existing, unlimited }: { existing: number; unlimited: boolean }): boolean {
  return unlimited || existing < FREE_POSTER_LIMIT;
}

/**
 * La limite applicable, ou `null` quand il n'y en a pas.
 *
 * Sert à l'écrire dans l'interface plutôt qu'à décider : la décision est
 * `canSavePoster`, et un écran qui recalculerait le seuil à sa façon finirait
 * par ne plus dire la même chose que le serveur.
 */
export function posterLimitFor(unlimited: boolean): number | null {
  return unlimited ? null : FREE_POSTER_LIMIT;
}

/**
 * Vrai si ce compte a atteint sa limite.
 *
 * Le pendant de `canSavePoster` pour l'affichage. **Supérieur ou égal**, et non
 * l'égalité : un compte dont l'abonnement s'est arrêté garde toutes les
 * affiches qu'il avait — on n'en supprime aucune —, il ne peut simplement plus
 * en ajouter.
 */
export function hasReachedPosterLimit({ existing, unlimited }: { existing: number; unlimited: boolean }): boolean {
  return !canSavePoster({ existing, unlimited });
}

/**
 * Vrai si cette affiche peut être modifiée.
 *
 * Toujours : réécrire une affiche qu'on possède déjà n'en ajoute pas une de
 * plus. Un compte qui en garde trois et perd son abonnement continue donc de
 * les ouvrir, de les corriger et de les supprimer — seule la création d'une
 * quatrième lui est fermée. C'est plus doux que la règle des listes de
 * souhaits, qui gèle les listes surnuméraires, et la raison en est le rapport
 * de taille : une affiche est une poignée d'identifiants, pas un inventaire
 * qu'on remplit carte à carte.
 */
export function canEditSavedPoster(): boolean {
  return true;
}
