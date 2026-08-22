import "server-only";

import { Document, ObjectId, WithId } from "mongodb";

import db from "@/lib/mongodb";
import type {
  StreamLink,
  StreamLinkLive,
  StreamPlatform,
  StreamSubscription,
  StreamTarget,
  WatchedVideo,
} from "@/lib/types/StreamLink";

/**
 * Les chaînes de direct liées aux comptes.
 *
 * Index attendus sur la collection `stream_links` :
 *
 *  - `{ userId: 1, platform: 1 }` **unique** — un compte ne lie qu'une chaîne
 *    par plateforme, ce qui est exactement ce que le compte social lui-même
 *    autorise. Sans cette contrainte, deux liaisons concurrentes annonceraient
 *    deux directs pour la même personne.
 *  - `{ platform: 1, channelId: 1 }` **unique** — le chemin des webhooks, qui
 *    n'apprennent de la plateforme qu'un identifiant de chaîne. L'unicité y est
 *    aussi une règle : une chaîne appartient à un compte, sinon un direct
 *    s'annoncerait chez deux personnes.
 *  - `{ "subscription.expiresAt": 1 }` — le cron de renouvellement, qui ne veut
 *    que les baux qui expirent bientôt.
 */

const COLLECTION_NAME = "stream_links";

const collection = db.collection(COLLECTION_NAME);

function toStreamLink(doc: WithId<Document>): StreamLink {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    platform: doc.platform,
    channelId: doc.channelId,
    channelLogin: doc.channelLogin || undefined,
    channelName: doc.channelName || undefined,
    channelUrl: doc.channelUrl || undefined,
    targets: (doc.targets ?? []) as StreamTarget[],
    subscription: (doc.subscription ?? { state: "idle" }) as StreamSubscription,
    live: (doc.live ?? null) as StreamLinkLive | null,
    watched: (doc.watched ?? undefined) as WatchedVideo[] | undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export type UpsertStreamLinkInput = {
  userId: string;
  platform: StreamPlatform;
  channelId: string;
  channelLogin?: string;
  channelName?: string;
  channelUrl?: string;
};

/**
 * Pose — ou rafraîchit — la liaison d'un compte.
 *
 * Appelée à chaque affichage de l'écran de compte : le nom d'une chaîne change,
 * et une liaison qui afficherait celui d'il y a six mois n'aiderait personne.
 * Les destinations, l'abonnement et le direct en cours ne sont **pas** touchés —
 * ce sont eux la valeur de la liaison, et une resynchronisation d'identité ne
 * doit pas les effacer.
 *
 * Le changement de chaîne pour un même compte (une personne qui relie un autre
 * compte Twitch) réécrit `channelId` et laisse les destinations en place : ce
 * sont les siennes, elle vient seulement de changer de micro. L'abonnement, lui,
 * devient caduc et repasse en `pending`, ce que le cron répare.
 */
export async function upsertStreamLink(input: UpsertStreamLinkInput): Promise<StreamLink> {
  const now = new Date().toISOString();
  const existing = await collection.findOne({ userId: input.userId, platform: input.platform });
  const channelChanged = Boolean(existing) && existing?.channelId !== input.channelId;

  const result = await collection.findOneAndUpdate(
    { userId: input.userId, platform: input.platform },
    {
      $set: {
        channelId: input.channelId,
        channelLogin: input.channelLogin ?? null,
        channelName: input.channelName ?? null,
        channelUrl: input.channelUrl ?? null,
        updatedAt: now,
        // `watched` n'existe que pour YouTube : le poser sur une liaison Twitch
        // écrirait un champ que rien ne lit et contredirait le type.
        ...(channelChanged
          ? {
              subscription: { state: "pending" },
              live: null,
              ...(input.platform === "youtube" ? { watched: [] } : {}),
            }
          : {}),
      },
      $setOnInsert: {
        userId: input.userId,
        platform: input.platform,
        targets: [],
        subscription: { state: "idle" },
        live: null,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  if (!result) {
    throw new Error("La liaison de chaîne n'a pas pu être enregistrée");
  }

  return toStreamLink(result);
}

export async function getStreamLink(userId: string, platform: StreamPlatform): Promise<StreamLink | null> {
  const doc = await collection.findOne({ userId, platform });
  return doc ? toStreamLink(doc) : null;
}

export async function getStreamLinksForUser(userId: string): Promise<StreamLink[]> {
  const docs = await collection.find({ userId }).toArray();
  return docs.map(toStreamLink);
}

/** Le chemin des webhooks : ils n'apprennent qu'une plateforme et une chaîne. */
export async function getStreamLinkByChannel(
  platform: StreamPlatform,
  channelId: string,
): Promise<StreamLink | null> {
  const doc = await collection.findOne({ platform, channelId });
  return doc ? toStreamLink(doc) : null;
}

export async function getStreamLinkById(id: string): Promise<StreamLink | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const doc = await collection.findOne({ _id: new ObjectId(id) });
  return doc ? toStreamLink(doc) : null;
}

/** Toutes les liaisons d'une plateforme qui ont au moins une destination. */
export async function listActiveStreamLinks(platform: StreamPlatform): Promise<StreamLink[]> {
  const docs = await collection.find({ platform, "targets.0": { $exists: true } }).toArray();
  return docs.map(toStreamLink);
}

/** Les liaisons qui annoncent un direct en ce moment — la moitié « fin de direct » du cron. */
export async function listLiveStreamLinks(platform: StreamPlatform): Promise<StreamLink[]> {
  const docs = await collection.find({ platform, live: { $ne: null } }).toArray();
  return docs.map(toStreamLink);
}

async function patch(id: string, update: Document): Promise<StreamLink | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { ...update, $set: { ...(update.$set as Document | undefined), updatedAt: new Date().toISOString() } },
    { returnDocument: "after" },
  );

  return result ? toStreamLink(result) : null;
}

export async function setStreamLinkTargets(id: string, targets: StreamTarget[]): Promise<StreamLink | null> {
  return patch(id, { $set: { targets } });
}

export async function setStreamLinkSubscription(
  id: string,
  subscription: StreamSubscription,
): Promise<StreamLink | null> {
  return patch(id, { $set: { subscription } });
}

/**
 * Écrit quelques champs de l'abonnement, sans toucher aux autres.
 *
 * Nécessaire à cause d'une course bien réelle : Twitch et le hub WebSub
 * rappellent notre webhook pour confirmer un abonnement **avant**, parfois, que
 * la réponse à notre propre requête ne nous soit revenue. Un
 * `setStreamLinkSubscription` complet écraserait alors le « actif » que la
 * confirmation vient d'écrire, et la liaison resterait « en attente » alors
 * qu'elle fonctionne.
 *
 * D'où les écritures par champ : on pose « en attente » avant d'appeler la
 * plateforme, puis on ne range que les identifiants — jamais l'état — au retour.
 */
export async function mergeStreamLinkSubscription(
  id: string,
  fields: Partial<StreamSubscription>,
): Promise<StreamLink | null> {
  const $set: Document = {};
  const $unset: Document = {};

  for (const [key, value] of Object.entries(fields)) {
    // `undefined` veut dire « efface ce champ », pas « écris undefined » : un
    // `lastError` résolu doit disparaître du document, pas y rester en `null` où
    // il contredirait le type déclaré.
    if (value === undefined) {
      $unset[`subscription.${key}`] = "";
    } else {
      $set[`subscription.${key}`] = value;
    }
  }

  return patch(id, {
    ...(Object.keys($set).length > 0 ? { $set } : {}),
    ...(Object.keys($unset).length > 0 ? { $unset } : {}),
  });
}

export async function setStreamLinkLive(id: string, live: StreamLinkLive | null): Promise<StreamLink | null> {
  return patch(id, { $set: { live } });
}

export async function setWatchedVideos(id: string, watched: WatchedVideo[]): Promise<StreamLink | null> {
  return patch(id, { $set: { watched } });
}

export async function deleteStreamLink(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) {
    return false;
  }

  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

/**
 * Retire une destination de **toutes** les liaisons.
 *
 * Le rattrapage d'un lieu ou d'un groupe supprimé : la destination n'existe
 * plus, la garder ferait échouer une annonce sur deux sans que personne ne
 * comprenne pourquoi.
 */
export async function purgeStreamTarget(target: StreamTarget): Promise<number> {
  const result = await collection.updateMany(
    { "targets.kind": target.kind, "targets.id": target.id },
    { $pull: { targets: { kind: target.kind, id: target.id } } as Document, $set: { updatedAt: new Date().toISOString() } },
  );

  return result.modifiedCount;
}

/**
 * Les directs en cours parmi une liste de comptes.
 *
 * Le registre en a besoin par lot : afficher la pastille « en direct » sur
 * vingt fiches ne doit pas coûter vingt lectures.
 */
export async function listLiveStreamLinksForUsers(userIds: string[]): Promise<StreamLink[]> {
  if (userIds.length === 0) {
    return [];
  }

  const docs = await collection.find({ userId: { $in: userIds }, live: { $ne: null } }).toArray();

  return docs.map(toStreamLink);
}

/**
 * Ceux qui diffusent en ce moment **et l'annoncent sur leur profil**.
 *
 * La destination compte : une chaîne liée qui n'annonce que sur un lieu ne doit
 * pas apparaître dans la bande des directs du registre. C'est la même règle que
 * partout ailleurs — la liste des destinations *est* le réglage.
 */
export async function listLiveUserShowcases(limit: number): Promise<StreamLink[]> {
  const docs = await collection
    .find({ live: { $ne: null }, "targets.kind": "user" })
    .limit(Math.max(1, Math.min(limit, 50)))
    .toArray();

  return docs.map(toStreamLink);
}
