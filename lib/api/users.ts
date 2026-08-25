import "server-only";

import { getUserByTagOrId } from "@/lib/db/users";
import { parseProfileHandle, toLookupKey } from "@/lib/users/handle";
import type { User } from "@/lib/types/User";

/**
 * Le compte que désigne le segment `{userTagOrId}` d'une route d'API.
 *
 * Chaque route sous `/users/{userTagOrId}` avait sa propre copie de ce
 * découpage, et les trois se trompaient de la même façon : elles prenaient
 * aveuglément les quatre derniers caractères pour un discriminateur, si bien
 * qu'un pseudonyme qui n'y finit pas — ou un identifiant Mongo — se résolvait
 * en un tag qui ne désigne personne. `parseProfileHandle` (`lib/users/handle.ts`,
 * pur et testé) sait les trois formes et les reconnaît dans le bon ordre.
 *
 * `null` couvre les deux issues qui se traitent pareil du point de vue d'un
 * appelant : une adresse illisible et un compte inexistant sont l'un comme
 * l'autre un 404 — distinguer les deux renseignerait sur ce qui existe.
 */
export async function findUserByParam(raw: string): Promise<User | null> {
  const key = toLookupKey(parseProfileHandle(decodeURIComponent(raw)));

  return key ? await getUserByTagOrId(key) : null;
}
