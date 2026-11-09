/**
 * Où renvoyer quelqu'un après sa connexion, quand l'adresse vient de l'URL.
 *
 * `?callbackUrl=`, `?redirect=` et `?from=` sont écrits par nous, mais lus
 * depuis la barre d'adresse : n'importe qui peut fabriquer un lien de
 * connexion qui en porte un autre. Sans contrôle, deux abus sont possibles :
 *
 * - `javascript:…` posé dans `window.location.href` exécute du script sur
 *   notre origine, avec la session qui vient de s'ouvrir ;
 * - `https://ailleurs.example` (ou `//ailleurs.example`) emmène la personne
 *   sur un site tiers au sortir d'une vraie page de connexion Joutes — le
 *   décor idéal pour lui redemander son code.
 *
 * Seul un **chemin interne** est donc accepté : il commence par un `/` unique.
 * `//hôte` et `/\hôte` sont refusés parce que les navigateurs les lisent comme
 * une adresse relative au protocole ; les caractères de contrôle aussi, qu'ils
 * retirent avant d'interpréter l'adresse (`/\t/hôte` devient `//hôte`).
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;

  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;

  return value;
}
