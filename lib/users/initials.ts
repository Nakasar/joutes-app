/**
 * Les initiales d'un compte, pour le rond qui remplace son avatar quand il n'en
 * a pas.
 *
 * Module pur, sans accès à la base ni à React : la règle de découpe est ce qui
 * mérite un test, pas le `<span>` qui l'affiche.
 */

/** Tout ce qui n'est ni lettre ni chiffre sépare deux mots. */
const SEPARATORS = /[^\p{L}\p{N}]+/u;

/**
 * Une lettre par mot, deux au plus : « Kevin Thizy » donne « KT », « kaelis »
 * donne « K ».
 *
 * Une adresse e-mail, passée faute de pseudonyme, ne garde que sa partie
 * locale — sans quoi `nom@gmail.com` ferait porter « NG » à tous les comptes
 * d'un même fournisseur. Les séparateurs d'un identifiant (`jean.dupont`,
 * `jean_dupont`) comptent comme des espaces.
 *
 * Un nom sans aucune lettre ni chiffre rend une chaîne vide plutôt que des
 * initiales de ponctuation : c'est à l'appelant de replier sur une silhouette.
 */
export function accountInitials(name?: string | null): string {
  const [local] = (name ?? "").split("@");
  const words = local.split(SEPARATORS).filter(Boolean);

  return words
    .slice(0, 2)
    // `charAt` couperait en deux une lettre hors du plan multilingue de base
    // (certaines extensions CJK), et rendrait un demi-caractère.
    .map((word) => [...word][0].toUpperCase())
    .join("");
}
