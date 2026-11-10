/**
 * L'avatar Discord d'un compte, recopié à la connexion.
 *
 * better-auth écrit `user.image` **à l'inscription seulement** : à chaque
 * connexion suivante, il relit bien le profil Discord, mais ne réécrit le compte
 * que si `overrideUserInfoOnSignIn` est posé — et cette option écraserait aussi
 * le nom (qui sert d'identifiant `username`) et l'adresse e-mail. Or l'URL d'un
 * avatar Discord porte l'empreinte de l'image (`/avatars/<id>/<empreinte>.png`) :
 * quand la personne change de photo sur Discord, l'ancienne adresse répond 404,
 * et Joutes affichait une image cassée jusqu'à la fin des temps.
 *
 * On ne remplace donc que l'image, et seulement quand celle qu'on tient venait
 * déjà de Discord : une image posée autrement (un autre fournisseur, une
 * reprise de données) n'est pas à Discord de la changer, et un compte sans
 * image n'en reçoit pas une dans son dos. L'image de profil téléversée sur
 * Joutes (`profileImage`) n'est jamais touchée, et reste prioritaire à
 * l'affichage.
 *
 * Module sans base de données, pour être testé seul ; l'écriture vit dans
 * `lib/db/users.ts` (`refreshDiscordImage`).
 */

const DISCORD_CDN_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

/** Une adresse d'image servie par Discord. */
export function isDiscordImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && DISCORD_CDN_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Faut-il remplacer l'image du compte par celle que Discord vient de rendre ?
 * Oui quand l'image actuelle vient de Discord et diffère de la nouvelle.
 */
export function shouldRefreshDiscordImage(current: unknown, fresh: unknown): fresh is string {
  return isDiscordImageUrl(current) && isDiscordImageUrl(fresh) && current !== fresh;
}
