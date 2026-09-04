import db from "@/lib/mongodb";
import { ObjectId, type WithId } from "mongodb";

import {
  MAX_USER_CONTENTS,
  type UserContent,
  type UserContentVisibility,
} from "@/lib/types/UserContent";
import type { UserContentPayload } from "@/lib/schemas/user-content.schema";

/**
 * Les contenus publiés par les joueurs.
 *
 * Collection de tête, et non tableau dans le document `user` : la vitrine d'un
 * groupe de jeu doit pouvoir demander « les contenus publics des membres de ce
 * groupe », ce qu'un sous-document ne sait pas faire sans relire tous les
 * comptes concernés.
 */

const COLLECTION_NAME = "userContents";

type UserContentDocument = {
  _id: ObjectId;
  authorId: string;
  kind: UserContent["kind"];
  visibility: UserContentVisibility;
  title: string;
  summary?: string;
  body?: string;
  url?: string;
  thumbnail?: string;
  duration?: string;
  gameId?: string;
  publishedAt: string;
  updatedAt?: string;
};

const userContentsCollection = db.collection<UserContentDocument>(COLLECTION_NAME);

function toUserContent(doc: WithId<UserContentDocument>): UserContent {
  return {
    id: doc._id.toString(),
    authorId: doc.authorId,
    kind: doc.kind,
    visibility: doc.visibility,
    title: doc.title,
    summary: doc.summary || undefined,
    body: doc.body || undefined,
    url: doc.url || undefined,
    thumbnail: doc.thumbnail || undefined,
    duration: doc.duration || undefined,
    gameId: doc.gameId || undefined,
    publishedAt: doc.publishedAt,
    updatedAt: doc.updatedAt || undefined,
  };
}

/** Combien de contenus ce compte a déjà publiés — la borne se vérifie avant d'écrire. */
export async function countUserContents(authorId: string): Promise<number> {
  return userContentsCollection.countDocuments({ authorId });
}

export class UserContentLimitError extends Error {
  constructor() {
    super(`Un compte ne peut pas publier plus de ${MAX_USER_CONTENTS} contenus`);
    this.name = "UserContentLimitError";
  }
}

export async function createUserContent(
  authorId: string,
  input: UserContentPayload,
): Promise<UserContent> {
  if ((await countUserContents(authorId)) >= MAX_USER_CONTENTS) {
    throw new UserContentLimitError();
  }

  const now = new Date().toISOString();
  const doc: UserContentDocument = {
    _id: new ObjectId(),
    authorId,
    ...input,
    publishedAt: now,
  };

  await userContentsCollection.insertOne(doc);
  return toUserContent(doc);
}

/**
 * Réécrit un contenu, à condition qu'il appartienne à l'auteur.
 *
 * La propriété est dans le filtre et non vérifiée en amont : entre une lecture
 * et une écriture, le contenu a pu changer de main — il ne peut pas, mais c'est
 * exactement le genre d'hypothèse qu'un filtre rend inutile.
 */
export async function updateUserContent(
  id: string,
  authorId: string,
  input: UserContentPayload,
): Promise<UserContent | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const updated = await userContentsCollection.findOneAndUpdate(
    { _id: ObjectId.createFromHexString(id), authorId },
    { $set: { ...input, updatedAt: new Date().toISOString() } },
    { returnDocument: "after" },
  );

  return updated ? toUserContent(updated) : null;
}

export async function setUserContentVisibility(
  id: string,
  authorId: string,
  visibility: UserContentVisibility,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) {
    return false;
  }

  const result = await userContentsCollection.updateOne(
    { _id: ObjectId.createFromHexString(id), authorId },
    { $set: { visibility, updatedAt: new Date().toISOString() } },
  );

  return result.matchedCount > 0;
}

export async function deleteUserContent(id: string, authorId: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) {
    return false;
  }

  const result = await userContentsCollection.deleteOne({
    _id: ObjectId.createFromHexString(id),
    authorId,
  });

  return result.deletedCount > 0;
}

export async function getUserContentById(id: string): Promise<UserContent | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const doc = await userContentsCollection.findOne({ _id: ObjectId.createFromHexString(id) });
  return doc ? toUserContent(doc) : null;
}

/** Tout ce qu'un compte a publié — l'écran de gestion, brouillons compris. */
export async function listContentsByAuthor(authorId: string): Promise<UserContent[]> {
  const docs = await userContentsCollection
    .find({ authorId })
    .sort({ publishedAt: -1 })
    .limit(MAX_USER_CONTENTS)
    .toArray();

  return docs.map(toUserContent);
}

/** Ce qu'un compte montre — la vitrine de son profil. */
export async function listPublicContentsByAuthor(
  authorId: string,
  limit = 24,
): Promise<UserContent[]> {
  const docs = await userContentsCollection
    .find({ authorId, visibility: "public" })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toUserContent);
}

/**
 * Ce que les membres d'un groupe montrent — la vitrine du groupe.
 *
 * Un seul appel pour toute la liste des membres : la vitrine en affiche une
 * poignée, et une requête par membre coûterait autant qu'il y a de monde dans
 * le groupe.
 */
export async function listPublicContentsByAuthors(
  authorIds: string[],
  limit = 12,
): Promise<UserContent[]> {
  if (authorIds.length === 0) {
    return [];
  }

  const docs = await userContentsCollection
    .find({ authorId: { $in: authorIds }, visibility: "public" })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toUserContent);
}

/**
 * Les derniers contenus publiés, tous auteurs confondus.
 *
 * `listPublicContentsByAuthors` répond à « ce qu'ont publié ces gens-là » —
 * la vitrine d'un profil ou d'un groupe. L'accueil pose l'autre question :
 * « ce qui vient de paraître », sans savoir d'avance qui l'a écrit. D'où ce
 * second index, sur la visibilité et la date.
 */
export async function listRecentPublicContents({
  gameId,
  limit = 12,
}: { gameId?: string; limit?: number } = {}): Promise<UserContent[]> {
  const filter: Record<string, unknown> = { visibility: "public" };
  if (gameId) {
    filter.gameId = gameId;
  }

  const docs = await userContentsCollection
    .find(filter)
    .sort({ publishedAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toUserContent);
}

/** Suppression par la modération : sans auteur au filtre, sur signalement. */
export async function deleteUserContentAsModerator(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) {
    return false;
  }

  const result = await userContentsCollection.deleteOne({
    _id: ObjectId.createFromHexString(id),
  });

  return result.deletedCount > 0;
}

export async function createUserContentIndexes(): Promise<void> {
  await userContentsCollection.createIndex({ authorId: 1, publishedAt: -1 });
  // Le tri accompagne le filtre : la vitrine d'un groupe cherche les contenus
  // publics d'une liste d'auteurs, du plus récent au plus ancien.
  await userContentsCollection.createIndex({ visibility: 1, authorId: 1, publishedAt: -1 });
  /*
   * Le fil de l'accueil ne connaît pas d'auteur : il lit « ce qui vient de
   * paraître ». L'index ci-dessus ne peut pas le servir — son `authorId` au
   * milieu laisse le tri sans appui dès qu'on ne fixe pas l'auteur. D'où ces
   * deux-là, un par forme de la question : tous jeux confondus, ou sur un jeu.
   */
  await userContentsCollection.createIndex({ visibility: 1, publishedAt: -1 });
  await userContentsCollection.createIndex({ visibility: 1, gameId: 1, publishedAt: -1 });
}
