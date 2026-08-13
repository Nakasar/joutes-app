import 'server-only';

import db from "@/lib/mongodb";
import { Document, ObjectId, WithId } from "mongodb";
import type { PushDevice, PushEnvironment, PushPlatform } from "@/lib/types/PushDevice";

/**
 * Les appareils enregistrés pour le push.
 *
 * Index attendus sur la collection `push_devices` :
 *
 *  - `{ token: 1 }` **unique** — un jeton n'appartient qu'à un compte. Sans
 *    cette contrainte, un téléphone revendu ferait recevoir à son ancien
 *    propriétaire les notifications du nouveau.
 *  - `{ userId: 1, state: 1 }` — le fan-out, qui part toujours d'utilisateurs.
 *  - `{ installationId: 1, userId: 1 }` — la rotation de jeton et la révocation
 *    à la déconnexion, où l'app ne connaît que son installation.
 *
 * Et, hors de cette collection mais indispensable au fan-out :
 * `{ lairs: 1 }` sur `user`, sans quoi chaque notification de lair balaie toute
 * la base des comptes (cf. `lib/db/notifications-audience.ts`).
 */

const COLLECTION_NAME = "push_devices";

function toPushDevice(doc: WithId<Document>): PushDevice {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    platform: doc.platform,
    token: doc.token,
    installationId: doc.installationId,
    environment: doc.environment || undefined,
    locale: doc.locale || undefined,
    appVersion: doc.appVersion || undefined,
    state: doc.state ?? "active",
    createdAt: doc.createdAt,
    lastSeenAt: doc.lastSeenAt,
    revokedAt: doc.revokedAt || undefined,
    lastErrorAt: doc.lastErrorAt || undefined,
    lastError: doc.lastError || undefined,
  };
}

export type RegisterPushDeviceInput = {
  userId: string;
  platform: PushPlatform;
  token: string;
  installationId: string;
  environment?: PushEnvironment;
  locale?: string;
  appVersion?: string;
};

/**
 * Enregistre — ou réveille — l'appareil d'un utilisateur.
 *
 * Deux écritures, dans cet ordre : on détache d'abord la même installation d'un
 * autre compte (un téléphone prêté, une session refermée), puis on pose le
 * jeton. L'inverse laisserait un instant deux comptes sur le même appareil.
 *
 * Ces deux écritures ne sont pas atomiques, et l'index unique sur le jeton peut
 * lever un `E11000` si deux enregistrements se croisent. On rejoue alors une
 * fois : le perdant de la course retrouve le document que le gagnant vient
 * d'écrire, et se contente de le mettre à jour.
 */
export async function registerPushDevice(input: RegisterPushDeviceInput): Promise<PushDevice> {
  const collection = db.collection(COLLECTION_NAME);
  const now = new Date().toISOString();

  await collection.deleteMany({
    installationId: input.installationId,
    userId: { $ne: input.userId },
  });

  const update = {
    $set: {
      userId: input.userId,
      platform: input.platform,
      token: input.token,
      installationId: input.installationId,
      ...(input.environment ? { environment: input.environment } : {}),
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.appVersion ? { appVersion: input.appVersion } : {}),
      state: "active" as const,
      lastSeenAt: now,
    },
    // Un ré-enregistrement efface la révocation et le dernier échec : l'appareil
    // vient de se manifester, ce qu'on savait de ses ennuis n'a plus cours.
    $unset: { revokedAt: "", lastError: "", lastErrorAt: "" },
    $setOnInsert: { createdAt: now },
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const doc = await collection.findOneAndUpdate(
        { token: input.token },
        update,
        { upsert: true, returnDocument: "after" }
      );
      if (doc) return toPushDevice(doc);
    } catch (error) {
      const isDuplicate = (error as { code?: number }).code === 11000;
      if (!isDuplicate || attempt === 1) throw error;
    }
  }

  throw new Error("Enregistrement de l'appareil impossible");
}

/** Les appareils d'un utilisateur, le plus récemment vu en premier. */
export async function listPushDevicesForUser(userId: string): Promise<PushDevice[]> {
  const docs = await db
    .collection(COLLECTION_NAME)
    .find({ userId })
    .sort({ lastSeenAt: -1 })
    .toArray();

  return docs.map(toPushDevice);
}

/**
 * Les appareils joignables d'une liste d'utilisateurs.
 *
 * Le filtre des préférences se fait ici, en une passe sur `user` plutôt qu'en
 * interrogeant le compte de chaque destinataire : un `$in`, une projection sur
 * l'identifiant, et on ne garde que ceux qui n'ont pas coupé le push.
 *
 * `after` pagine sur `_id` : le cron de dépilage reprend là où il s'est arrêté,
 * sans `skip` — un `skip` sur des dizaines de milliers de lignes coûte le
 * balayage qu'il prétend éviter.
 */
export async function listActiveDevicesForUsers(
  userIds: string[],
  options: { limit?: number; after?: string } = {}
): Promise<PushDevice[]> {
  if (userIds.length === 0) return [];

  const allowed = await db
    .collection("user")
    .find(
      {
        _id: { $in: userIds.map((id) => new ObjectId(id)) },
        "notifications.app.push.enabled": { $ne: false },
      },
      { projection: { _id: 1 } }
    )
    .toArray();

  if (allowed.length === 0) return [];

  const docs = await db
    .collection(COLLECTION_NAME)
    .find({
      userId: { $in: allowed.map((user) => user._id.toString()) },
      state: "active",
      ...(options.after ? { _id: { $gt: new ObjectId(options.after) } } : {}),
    })
    .sort({ _id: 1 })
    .limit(options.limit ?? 500)
    .toArray();

  return docs.map(toPushDevice);
}

/** Combien d'appareils une notification ferait sonner. Sert à choisir entre l'envoi immédiat et la file. */
export async function countActiveDevicesForUsers(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;

  return db.collection(COLLECTION_NAME).countDocuments({
    userId: { $in: userIds },
    state: "active",
  });
}

/** Retrait volontaire : on garde la ligne, un ré-enregistrement la réveille. */
export async function revokePushDevice(userId: string, deviceId: string): Promise<boolean> {
  if (!ObjectId.isValid(deviceId)) return false;

  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(deviceId), userId },
    { $set: { state: "revoked", revokedAt: new Date().toISOString() } }
  );

  return result.matchedCount > 0;
}

/** Même chose, quand l'app ne connaît que son installation (déconnexion). */
export async function revokePushDeviceByInstallation(
  userId: string,
  installationId: string
): Promise<boolean> {
  const result = await db.collection(COLLECTION_NAME).updateMany(
    { installationId, userId },
    { $set: { state: "revoked", revokedAt: new Date().toISOString() } }
  );

  return result.matchedCount > 0;
}

/**
 * Suppression des jetons que le fournisseur a déclarés morts.
 *
 * On supprime au lieu de marquer : un jeton mort ne ressuscite pas, et sa ligne
 * ne ferait qu'occuper l'index unique le jour où le système d'exploitation
 * réattribue le même jeton à une autre installation.
 */
export async function deletePushDevicesByTokens(tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;

  const result = await db.collection(COLLECTION_NAME).deleteMany({ token: { $in: tokens } });
  return result.deletedCount;
}

/** Trace d'un échec qui ne justifie pas la suppression. Diagnostic seulement. */
export async function recordPushFailure(token: string, error: string): Promise<void> {
  await db.collection(COLLECTION_NAME).updateOne(
    { token },
    { $set: { lastError: error.slice(0, 300), lastErrorAt: new Date().toISOString() } }
  );
}

/** Retient l'environnement APNs qui a effectivement accepté le jeton. */
export async function setPushDeviceEnvironment(
  token: string,
  environment: PushEnvironment
): Promise<void> {
  await db.collection(COLLECTION_NAME).updateOne({ token }, { $set: { environment } });
}
