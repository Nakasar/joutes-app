import "server-only";

import { Document, ObjectId, WithId } from "mongodb";

import db from "@/lib/mongodb";
import type { GameLive, GameStream, GameStreamPlatform } from "@/lib/types/GameStream";
import type { WatchedVideo } from "@/lib/types/StreamLink";

/**
 * Les chaînes d'éditeurs suivies pour leurs directs.
 *
 * Index attendus sur la collection `game_streams` (voir
 * `scripts/db/ensure-indexes.ts`) :
 *
 *  - `{ gameId: 1, platform: 1 }` **unique** — un jeu ne suit qu'une chaîne par
 *    plateforme, parce que sa fiche ne porte qu'un lien par réseau. L'unicité
 *    est ce qui permet à `upsert` d'être rejoué sans créer de doublon quand
 *    deux tours de cron se chevauchent.
 *  - `{ live: 1 }` — les lectures d'affichage ne veulent que ce qui diffuse, et
 *    c'est le cas courant qu'il n'y en ait aucun.
 *
 * Rien ici ne connaît YouTube : la réconciliation vit dans
 * `lib/streams/game-lives.ts`, et ce module ne fait que ranger.
 */

const COLLECTION_NAME = "game_streams";

const collection = db.collection(COLLECTION_NAME);

function toGameStream(doc: WithId<Document>): GameStream {
  return {
    id: doc._id.toString(),
    gameId: doc.gameId,
    platform: doc.platform,
    sourceUrl: doc.sourceUrl,
    channelId: doc.channelId,
    channelTitle: doc.channelTitle || undefined,
    handle: doc.handle || undefined,
    watched: (doc.watched ?? []) as WatchedVideo[],
    live: (doc.live ?? null) as GameLive | null,
    checkedAt: doc.checkedAt || undefined,
    lastError: doc.lastError || undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export type UpsertGameStreamInput = {
  gameId: string;
  platform: GameStreamPlatform;
  sourceUrl: string;
  channelId: string;
  channelTitle?: string;
  handle?: string;
};

/**
 * Pose — ou rafraîchit — la chaîne suivie d'un jeu.
 *
 * Le direct en cours et les vidéos surveillées ne sont **pas** touchés tant que
 * la chaîne reste la même : ce sont eux la valeur du document, et un simple
 * rafraîchissement du titre n'a pas à éteindre un direct en cours.
 *
 * Un changement de chaîne, lui, remet les deux à zéro. Garder le direct de
 * l'ancienne chaîne afficherait sur la fiche du jeu une vidéo que plus rien ne
 * viendrait éteindre — la nouvelle chaîne n'en sait rien.
 */
export async function upsertGameStream(input: UpsertGameStreamInput): Promise<GameStream> {
  const now = new Date().toISOString();
  const existing = await collection.findOne({ gameId: input.gameId, platform: input.platform });
  const channelChanged = Boolean(existing) && existing?.channelId !== input.channelId;

  const result = await collection.findOneAndUpdate(
    { gameId: input.gameId, platform: input.platform },
    {
      $set: {
        sourceUrl: input.sourceUrl,
        channelId: input.channelId,
        channelTitle: input.channelTitle,
        handle: input.handle,
        updatedAt: now,
        ...(channelChanged ? { live: null, watched: [] } : {}),
      },
      $setOnInsert: {
        gameId: input.gameId,
        platform: input.platform,
        live: null,
        watched: [],
        createdAt: now,
      },
      $unset: { lastError: "" },
    },
    { upsert: true, returnDocument: "after" },
  );

  if (!result) {
    throw new Error("Chaîne de jeu introuvable après écriture");
  }

  return toGameStream(result);
}

export async function getGameStream(
  gameId: string,
  platform: GameStreamPlatform,
): Promise<GameStream | null> {
  const doc = await collection.findOne({ gameId, platform });
  return doc ? toGameStream(doc) : null;
}

/** Toutes les chaînes suivies d'une plateforme — ce dont part un tour de cron. */
export async function listGameStreams(platform: GameStreamPlatform): Promise<GameStream[]> {
  const docs = await collection.find({ platform }).toArray();
  return docs.map(toGameStream);
}

/**
 * Les chaînes qui diffusent en ce moment.
 *
 * Sans argument, toutes — c'est ce que regarde un visiteur, qui n'a pas de jeux
 * suivis. Avec une liste, seulement celles-là : l'accueil d'une personne
 * connectée ne montre que les jeux qu'elle suit, et une liste vide ne rend donc
 * rien plutôt que tout.
 */
export async function listLiveGameStreams(gameIds?: string[]): Promise<GameStream[]> {
  if (gameIds && gameIds.length === 0) {
    return [];
  }

  const docs = await collection
    .find({ live: { $ne: null }, ...(gameIds ? { gameId: { $in: gameIds } } : {}) })
    .toArray();

  return docs.map(toGameStream);
}

async function patch(id: string, update: Document): Promise<GameStream | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { ...update, $set: { ...(update.$set as Document | undefined), updatedAt: new Date().toISOString() } },
    { returnDocument: "after" },
  );

  return result ? toGameStream(result) : null;
}

export async function setGameStreamLive(id: string, live: GameLive | null): Promise<GameStream | null> {
  return patch(id, { $set: { live } });
}

export async function setGameStreamWatched(id: string, watched: WatchedVideo[]): Promise<GameStream | null> {
  return patch(id, { $set: { watched } });
}

/** Le passage du cron, qu'il ait trouvé un direct ou non. */
export async function touchGameStream(id: string, lastError?: string): Promise<GameStream | null> {
  return patch(id, {
    $set: { checkedAt: new Date().toISOString(), ...(lastError ? { lastError } : {}) },
    ...(lastError ? {} : { $unset: { lastError: "" } }),
  });
}

/**
 * Retire les chaînes dont plus aucun jeu ne parle.
 *
 * Un jeu supprimé, ou dont l'administration a effacé le lien YouTube : sans ce
 * ménage, sa chaîne resterait interrogée à chaque tour et son direct
 * continuerait de s'afficher là où il est encore lu.
 */
export async function deleteGameStreamsExcept(
  platform: GameStreamPlatform,
  gameIds: string[],
): Promise<number> {
  const result = await collection.deleteMany({ platform, gameId: { $nin: gameIds } });
  return result.deletedCount;
}
