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
  if (!userId) return null;

  // L'adaptateur MongoDB de better-auth range `userId` en `ObjectId`, mais une
  // base migrée d'une version antérieure peut porter la chaîne : on accepte
  // les deux formes, comme `findPatreonAccountId`.
  const candidates: unknown[] = [userId];
  if (ObjectId.isValid(userId)) {
    candidates.push(new ObjectId(userId));
  }

  const account = await db
    .collection<{ userId: unknown; providerId: string; createdAt?: Date }>("account")
    .findOne({ providerId, userId: { $in: candidates } }, { projection: { _id: 1 }, sort: { createdAt: -1 } });

  return account?._id.toString() ?? null;
}
