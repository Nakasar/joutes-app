import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/config/admins";
import { getLairsByIds } from "@/lib/db/lairs";
import { getUserById } from "@/lib/db/users";
import type { Lair } from "@/lib/types/Lair";

/**
 * Parmi ces lieux, ceux que le visiteur a le droit de voir.
 *
 * Même règle que `requireVisibleLair`, qui la pose pour un lieu à la fois : un
 * lieu public s'ouvre à tous, un lieu privé à ceux qui le suivent, à son équipe
 * et à l'administration. La différence est ce qu'on en fait — la vitrine d'un
 * lieu privé rend 404, une affiche qui en réunit plusieurs **écarte** celui
 * qu'on n'a pas le droit de voir et rend le reste. Refuser la page entière
 * apprendrait au passage qu'un lieu privé existe à cette adresse.
 *
 * La session n'est lue que si un lieu privé figure dans le lot : une sélection
 * de lieux publics — le cas courant — ne coûte que la lecture des lieux.
 *
 * L'ordre demandé est rendu tel quel : c'est celui que l'affiche écrit sous son
 * titre, et il appartient à qui l'a composée.
 */
export const visibleLairsAmong = cache(async (ids: string[]): Promise<Lair[]> => {
  if (ids.length === 0) {
    return [];
  }

  const found = await getLairsByIds(ids);
  const byId = new Map(found.map((lair) => [lair.id, lair]));
  const lairs = ids.map((id) => byId.get(id)).filter((lair): lair is Lair => lair !== undefined);

  if (lairs.every((lair) => !lair.isPrivate)) {
    return lairs;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  const admin = session?.user?.email ? isAdmin(session.user.email) : false;
  const user = userId ? await getUserById(userId) : null;
  const followed = new Set(user?.lairs ?? []);

  return lairs.filter(
    (lair) =>
      !lair.isPrivate ||
      admin ||
      followed.has(lair.id) ||
      (userId !== undefined && lair.owners.includes(userId)),
  );
});
