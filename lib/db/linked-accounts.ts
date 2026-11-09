import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";

/**
 * L'identifiant de la **ligne** `account` qui lie un compte Joutes à un
 * fournisseur (Discord, Twitch, Google, Patreon), ou `null`.
 *
 * Depuis better-auth 1.7, `unlinkAccount`, `getAccessToken` et `accountInfo`
 * désignent le compte lié par cet identifiant de ligne, et plus par le nom du
 * fournisseur. Ce n'est **pas** le champ `accountId` de la collection, qui est
 * l'identifiant de la personne chez le fournisseur : confondre les deux donne
 * un « compte introuvable » sans autre signe.
 *
 * Un compte Joutes ne lie qu'un compte par fournisseur ; s'il y en avait
 * plusieurs, le plus récent l'emporte.
 */
export async function findLinkedAccountId(userId: string, providerId: string): Promise<string | null> {
  if (!ObjectId.isValid(userId)) return null;

  const account = await db
    .collection<{ userId: ObjectId; providerId: string; createdAt?: Date }>("account")
    .findOne({ providerId, userId: new ObjectId(userId) }, { projection: { _id: 1 }, sort: { createdAt: -1 } });

  return account?._id.toString() ?? null;
}
