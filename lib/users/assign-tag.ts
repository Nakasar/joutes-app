/**
 * Poser le tag (pseudo#1234) d'un compte qui n'en a pas, sur la collection
 * `user` qu'on lui passe.
 *
 * À part de lib/db/users.ts pour que le script de rattrapage
 * (`npm run users:tags`) puisse le charger hors de Next : il n'importe que le
 * pilote MongoDB et des fonctions pures.
 */

import { ObjectId, type Collection, type Document } from "mongodb";
import { deriveDisplayName, randomDiscriminator } from "@/lib/users/tag";

export type AssignedTag = { displayName: string; discriminator: string };

/**
 * Un discriminateur à quatre chiffres libre pour ce pseudonyme : deux comptes
 * ne partagent pas un tag (la comparaison ignore la casse, comme la recherche
 * par tag). `exceptUserId` laisse de côté le compte lui-même.
 */
export async function uniqueDiscriminator(
  users: Collection<Document>,
  displayName: string,
  exceptUserId?: ObjectId
): Promise<string> {
  // En cas de collision on retente, jusqu'à épuisement raisonnable de l'espace.
  for (let i = 0; i < 50; i++) {
    const discriminator = randomDiscriminator();
    const existing = await users.findOne(
      { displayName, discriminator, ...(exceptUserId ? { _id: { $ne: exceptUserId } } : {}) },
      { collation: { locale: "en", strength: 2 }, projection: { _id: 1 } }
    );
    if (!existing) {
      return discriminator;
    }
  }
  throw new Error(`Impossible de générer un discriminateur unique pour "${displayName}"`);
}

/**
 * Donne son tag à un compte qui n'en a pas : un pseudonyme tiré de son nom
 * s'il n'en a pas choisi (`deriveDisplayName`), et un discriminateur libre pour
 * ce pseudonyme. Un compte déjà tagué n'est pas touché, ni un pseudonyme déjà
 * choisi.
 *
 * Idempotent, et sûr face à deux connexions simultanées : l'écriture ne vaut
 * que si le compte est encore tel qu'il a été lu.
 *
 * Rend le tag posé, ou `null` si le compte en avait déjà un (ou n'existe pas).
 */
export async function assignMissingTag(users: Collection<Document>, userId: string): Promise<AssignedTag | null> {
  if (!ObjectId.isValid(userId)) return null;
  const _id = new ObjectId(userId);
  const user = await users.findOne({ _id }, { projection: { displayName: 1, discriminator: 1, name: 1, email: 1 } });
  if (!user || (user.displayName && user.discriminator)) return null;

  const displayName: string = user.displayName || deriveDisplayName({ name: user.name, email: user.email });
  const discriminator = await uniqueDiscriminator(users, displayName, _id);

  const result = await users.updateOne(
    // L'état lu dans le filtre (`null` vaut aussi pour un champ absent) : un
    // pseudonyme choisi entre-temps n'est pas écrasé.
    { _id, displayName: user.displayName ?? null, discriminator: user.discriminator ?? null },
    { $set: { displayName, discriminator } }
  );

  return result.modifiedCount > 0 ? { displayName, discriminator } : null;
}
