import 'server-only';

import { cache } from "react";
import { anyUserHasPermission } from "@/lib/db/permissions";
import { getPlayGroupById } from "@/lib/db/play-groups";

/**
 * Qui a droit à la gestion avancée de collection.
 *
 * Une liste de souhaits, une liste de vente, appartiennent soit à une personne
 * soit à un groupe de jeu. Les deux cas ne se résolvent pas de la même façon, et
 * c'est le point de cette fonction : **pour un groupe, il suffit qu'un seul
 * membre soit abonné**. Le droit reste celui d'une personne, le groupe en
 * profite — et personne n'y perd si un autre membre se désabonne.
 *
 * La vérification ne consulte **pas la session** : elle porte sur le
 * propriétaire, qui n'est pas toujours l'appelant. C'est ce qui permet de la
 * poser dans `createWishlist` plutôt que dans chaque route, et de fermer du même
 * coup les trois chemins de création (API personnelle, API de groupe, outil MCP).
 */

export const ADVANCED_COLLECTION_PERMISSION = "collection:advanced";

export type CollectionOwner = { type: "user" | "playGroup"; id: string };

/**
 * Mémoïsé sur deux chaînes, et non sur l'objet propriétaire : `cache()` compare
 * ses arguments par identité, et un objet littéral en construit un neuf à chaque
 * appel — le mémo ne servirait jamais. Un écran vérifie ce droit deux fois (pour
 * afficher, puis pour créer), c'est exactement ce qu'on économise.
 */
const resolve = cache(async (type: CollectionOwner["type"], id: string): Promise<boolean> => {
  if (type === "user") {
    return anyUserHasPermission([id], ADVANCED_COLLECTION_PERMISSION);
  }

  const group = await getPlayGroupById(id);
  if (!group) {
    return false;
  }

  return anyUserHasPermission(
    group.members.map((member) => member.userId),
    ADVANCED_COLLECTION_PERMISSION
  );
});

export function ownerHasAdvancedCollection(owner: CollectionOwner): Promise<boolean> {
  return resolve(owner.type, owner.id);
}
