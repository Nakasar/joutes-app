/**
 * Signal « les jeux de l'utilisateur ont changé », à l'usage du menu de
 * navigation.
 *
 * Le menu « Jeux » de l'en-tête lit les jeux suivis et les favoris une fois, au
 * montage. Rien ne le rattache aux endroits où ces listes se modifient — la
 * fiche d'un jeu, la page du compte : `router.refresh()` rejoue les composants
 * serveur, mais l'en-tête est un composant client, son état lui survit. Sans ce
 * signal, le menu resterait donc en retard jusqu'au prochain chargement
 * complet, en contradiction avec l'étoile qu'on vient d'allumer.
 *
 * Un événement de fenêtre plutôt qu'un contexte : l'en-tête et ces pages n'ont
 * aucun ancêtre commun autre que la racine, et un contexte à ce niveau ferait
 * payer un rendu à toute l'application pour trois écrans.
 */

export const GAMES_CHANGED_EVENT = "joutes:games-changed";

/** À appeler après toute modification des jeux suivis ou des favoris. */
export function notifyGamesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GAMES_CHANGED_EVENT));
}
