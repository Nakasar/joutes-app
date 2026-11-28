/**
 * Les adresses que seuls les scanners de failles demandent : `/wp-login.php`,
 * `/.env`, `/.git/config`, `/phpmyadmin`…
 *
 * Joutes n'a ni PHP ni WordPress, et ne sert aucun fichier caché. Ces adresses
 * échappaient pourtant au proxy (son filtre laisse passer tout chemin qui
 * contient un point, pour les fichiers statiques) et tombaient sur la route
 * `/[locale]`, qui rendait le cadre du site pendant plus de trois secondes
 * avant de répondre 404. Le proxy les refuse désormais lui-même.
 *
 * Ajouter une extension ici suppose de l'ajouter aussi à `config.matcher` de
 * `proxy.ts`, qui décide des chemins à point que le proxy voit.
 */

/** Extensions qu'aucune adresse du site ne porte. */
export const PROBE_EXTENSIONS = [
  "php", "phtml", "asp", "aspx", "jsp", "cgi", "env", "sql", "bak", "old", "orig",
  "ini", "yml", "yaml", "conf", "config", "log", "sh", "swp", "pem", "key",
];

const EXTENSION = new RegExp(`\\.(?:${PROBE_EXTENSIONS.join("|")})\\d?(?:/|$)`, "i");

/** Un segment caché (`/.env`, `/.git/…`), hors `/.well-known/`. */
const DOTFILE = /(?:^|\/)\.(?!well-known(?:\/|$))[^/]/;

/** Répertoires d'autres logiciels, cherchés à la racine. */
const FOREIGN = /^\/(?:wp-(?:admin|content|includes|json|login)|wordpress|cgi-bin|phpmyadmin|pma|xmlrpc|vendor\/phpunit)(?:[/.]|$)/i;

export function isProbePath(pathname: string): boolean {
  return EXTENSION.test(pathname) || DOTFILE.test(pathname) || FOREIGN.test(pathname);
}
