/**
 * L'adresse d'un profil, dans les deux sens.
 *
 * Une page de profil se désigne de deux façons : par identifiant
 * (`/users/507f1f77bcf86cd799439011`) ou par tag concaténé
 * (`/users/Nakasar6666`, qui désigne `Nakasar#6666`). Le `#` ne peut pas
 * voyager dans une URL — il y ouvrirait un fragment — d'où la concaténation,
 * et d'où ce module qui la défait.
 *
 * Module pur, sans accès à la base : `lib/db/users.ts` ouvre une connexion
 * MongoDB au chargement et ne peut donc pas être importé par un test, alors que
 * l'interprétation du segment d'URL est exactement ce qui mérite d'en avoir un.
 */

/** Un identifiant Mongo, tel qu'il apparaît dans une URL. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Ce que le segment d'URL désigne, une fois interprété. */
export type ProfileHandle =
  | { kind: "id"; id: string }
  | { kind: "tag"; displayName: string; discriminator: string }
  | { kind: "unknown" };

/**
 * Interprète le segment d'URL.
 *
 * Trois formes sont reconnues : l'identifiant tel quel, le tag explicite
 * `Nakasar#6666` (que la barre d'adresse encode, et que `decodeURIComponent`
 * rend avant d'arriver ici), et le tag concaténé `Nakasar6666` dont on
 * redécoupe les quatre derniers chiffres.
 *
 * **L'ordre compte.** L'identifiant se reconnaît en premier : un
 * `507f1f77bcf86cd799439011` passé au découpage donnerait le tag imaginaire
 * `507f1f77bcf86cd7994390#9011`, qui ne désigne personne. C'est le bug que ce
 * module remplace — la garde précédente s'écrivait
 * `isNaN(+userTagOrId.substring(-4))`, et `substring` avec un argument négatif
 * rend **la chaîne entière** au lieu de ses quatre derniers caractères : elle
 * ne gardait donc rien de ce qu'elle prétendait garder.
 */
export function parseProfileHandle(value: string): ProfileHandle {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { kind: "unknown" };
  }

  if (OBJECT_ID.test(trimmed)) {
    return { kind: "id", id: trimmed.toLowerCase() };
  }

  // Le dernier « # » sépare le tag : un pseudonyme peut en contenir.
  const separator = trimmed.lastIndexOf("#");
  if (separator > 0) {
    const displayName = trimmed.slice(0, separator).trim();
    const discriminator = trimmed.slice(separator + 1).trim();

    if (displayName.length > 0 && /^\d+$/.test(discriminator)) {
      return { kind: "tag", displayName, discriminator };
    }

    return { kind: "unknown" };
  }

  // Tag concaténé : quatre chiffres en fin de chaîne, précédés d'un pseudonyme.
  // La longueur est imposée ici, à la différence de la forme explicite : sans
  // le `#`, rien d'autre ne dit où finit le pseudonyme.
  const concatenated = /^(.+?)(\d{4})$/.exec(trimmed);
  if (concatenated) {
    return { kind: "tag", displayName: concatenated[1], discriminator: concatenated[2] };
  }

  return { kind: "unknown" };
}

/**
 * La forme que `getUserByTagOrId` sait résoudre : l'identifiant tel quel, ou le
 * tag avec son `#`.
 */
export function toLookupKey(handle: ProfileHandle): string | null {
  switch (handle.kind) {
    case "id":
      return handle.id;
    case "tag":
      return `${handle.displayName}#${handle.discriminator}`;
    default:
      return null;
  }
}

/** Ce qu'il faut d'un compte pour lui fabriquer une adresse. */
export type ProfileAddressable = {
  id: string;
  displayName?: string;
  discriminator?: string;
};

/**
 * Adresse du profil public.
 *
 * Le tag y est **concaténé sans son `#`** — c'est la forme que la page sait
 * résoudre, et celle des liens de profil partout ailleurs dans l'application.
 * Un compte sans pseudonyme personnalisé n'a pas de tag : son identifiant sert
 * alors d'adresse, l'autre forme reconnue.
 */
export function userProfilePath(user: ProfileAddressable): string {
  if (user.displayName && user.discriminator) {
    return `/users/${encodeURIComponent(`${user.displayName}${user.discriminator}`)}`;
  }

  return `/users/${encodeURIComponent(user.id)}`;
}

/**
 * Le tag affiché : le pseudonyme personnalisé et son nombre quand il existe.
 *
 * Sans repli sur le nom de compte ici — l'appelant sait lequel il a sous la
 * main. `formatFullUsername` et `adminUserTag` portent chacun le leur.
 */
export function formatUserTag(displayName?: string, discriminator?: string): string | null {
  return displayName && discriminator ? `${displayName}#${discriminator}` : null;
}
