import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";

/**
 * Ouvre le push pour un compte.
 *
 * Appelé à l'enregistrement d'un appareil : accepter l'invite du système est
 * l'activation. Un `$set` inconditionnel plutôt qu'un `$setOnInsert` — quelqu'un
 * qui avait coupé le push et réautorise son téléphone exprime un changement
 * d'avis, pas un accident.
 */
export async function enablePushForUser(userId: string): Promise<void> {
  if (!ObjectId.isValid(userId)) return;

  await db
    .collection("user")
    .updateOne({ _id: new ObjectId(userId) }, { $set: { "notifications.app.push.enabled": true } });
}
