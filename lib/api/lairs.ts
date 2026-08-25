import "server-only";

import { ObjectId } from "mongodb";

import { isAdmin } from "@/lib/config/admins";
import { getLairById } from "@/lib/db/lairs";
import { getUserById } from "@/lib/db/users";
import type { Lair } from "@/lib/types/Lair";

/**
 * Le lieu que désigne `{lairId}`, si l'appelant a le droit de le voir.
 *
 * Reprise de la porte de `requireVisibleLair`
 * (`app/[locale]/(app)/lairs/[lairId]/lair-data.ts`) : un lieu privé ne s'ouvre
 * qu'à ceux qui le suivent et à son équipe. La confidentialité se lit sur le
 * lieu, et **le compte n'est chargé que si le lieu est privé** : un lieu public
 * se rend dès sa lecture, sans toucher à la collection des comptes.
 *
 * **`null` pour les deux issues, et jamais 403.** Un lieu absent et un lieu
 * qu'on n'a pas le droit de voir se répondent de la même façon : distinguer les
 * deux confirmerait l'existence d'un lieu privé à qui n'y a pas accès, ce qui
 * est précisément ce que sa confidentialité lui promet de taire.
 */
export async function findVisibleLair(
  lairId: string,
  viewerId: string | null,
): Promise<Lair | null> {
  // `getLairById` construit un `ObjectId` sans filet : un identifiant mal formé
  // y lève, et la route rendrait 500 là où elle doit rendre 404 — une adresse
  // illisible ne désigne pas plus de lieu qu'une adresse inconnue.
  if (!ObjectId.isValid(lairId) || lairId.length !== 24) {
    return null;
  }

  const lair = await getLairById(lairId);
  if (!lair) {
    return null;
  }

  if (!lair.isPrivate) {
    return lair;
  }

  if (!viewerId) {
    return null;
  }

  const user = await getUserById(viewerId);
  const isFollowing = user?.lairs?.includes(lairId) ?? false;
  const isOwner = lair.owners.includes(viewerId);

  return isFollowing || isOwner || isAdmin(user?.email) ? lair : null;
}
