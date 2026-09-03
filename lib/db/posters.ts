import 'server-only';

import { ObjectId, type Document, type WithId } from "mongodb";

import db from "@/lib/mongodb";
import { canSavePoster, FREE_POSTER_LIMIT } from "@/lib/posters/limits";
import { isPosterPeriod, isPosterStyleKey } from "@/lib/posters/styles";
import type { SavedPoster, SavedPosterInput } from "@/lib/types/SavedPoster";

const COLLECTION = "posters";

/**
 * Levée quand le compte a déjà toutes les affiches auxquelles il a droit.
 *
 * Une erreur nommée, et non un booléen rendu : la limite est décidée **ici**,
 * au moment d'écrire, et l'appelant qui l'ignorerait doit échouer plutôt que
 * de croire avoir enregistré. Même motif que `WishlistLimitError`.
 */
export class PosterLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Limite de ${limit} affiche(s) atteinte`);
    this.name = "PosterLimitError";
  }
}

/** Levée quand une affiche du même nom existe déjà pour ce compte. */
export class PosterNameTakenError extends Error {
  constructor(public readonly name: string) {
    super(`Une affiche nommée « ${name} » existe déjà`);
    this.name = "PosterNameTakenError";
  }
}

function toSavedPoster(doc: WithId<Document>): SavedPoster {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    name: doc.name,
    lairIds: Array.isArray(doc.lairIds) ? doc.lairIds : [],
    gameIds: Array.isArray(doc.gameIds) ? doc.gameIds : [],
    // Les valeurs de la base sont relues, jamais crues : un document écrit
    // avant qu'un style ne disparaisse ne doit pas rendre une affiche cassée.
    period: isPosterPeriod(doc.period) ? doc.period : "week",
    style: isPosterStyleKey(doc.style) ? doc.style : "joutes",
    showAttendance: doc.showAttendance !== false,
    gameLogos: doc.gameLogos !== false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Les index, créés à l'import comme ailleurs dans ce dépôt.
 *
 * L'unicité du nom par compte n'est pas cosmétique : deux affiches du même nom
 * ne se distinguent pas dans une liste, et c'est par le nom qu'on retrouve la
 * sienne. `createIndex` est idempotent — même motif que `lib/db/wishlists.ts`.
 */
const indexesReady = Promise.all([
  db.collection(COLLECTION).createIndex({ userId: 1, name: 1 }, { unique: true }),
  db.collection(COLLECTION).createIndex({ userId: 1, updatedAt: -1 }),
]).catch((error) => {
  console.error("Impossible de créer les index des affiches:", error);
});

/** Les affiches d'un compte, la dernière touchée en tête. */
export async function getPostersByUser(userId: string): Promise<SavedPoster[]> {
  await indexesReady;

  const docs = await db.collection(COLLECTION).find({ userId }).sort({ updatedAt: -1 }).toArray();

  return docs.map(toSavedPoster);
}

export async function countPostersByUser(userId: string): Promise<number> {
  await indexesReady;

  return db.collection(COLLECTION).countDocuments({ userId });
}

/**
 * Une affiche de ce compte, ou `null`.
 *
 * Le compte fait partie de la requête et non d'un contrôle qui suivrait :
 * demander l'affiche d'autrui ne rend rien, plutôt que de rendre puis de
 * refuser. Un identifiant mal formé rend `null` — `new ObjectId("bonjour")`
 * lève, et une adresse bricolée ne mérite pas une erreur 500.
 */
export async function getPosterForUser(posterId: string, userId: string): Promise<SavedPoster | null> {
  await indexesReady;

  if (!ObjectId.isValid(posterId)) {
    return null;
  }

  const doc = await db.collection(COLLECTION).findOne({ _id: new ObjectId(posterId), userId });

  return doc ? toSavedPoster(doc) : null;
}

/**
 * Enregistre une affiche de plus.
 *
 * La limite se vérifie ici, au bord de l'écriture, et non dans l'écran : c'est
 * le seul endroit que tous les chemins traversent.
 */
export async function createPoster(
  userId: string,
  input: SavedPosterInput,
  { unlimited }: { unlimited: boolean },
): Promise<SavedPoster> {
  await indexesReady;

  const existing = await db.collection(COLLECTION).countDocuments({ userId });

  if (!canSavePoster({ existing, unlimited })) {
    throw new PosterLimitError(FREE_POSTER_LIMIT);
  }

  const now = new Date();
  const document = { userId, ...input, createdAt: now, updatedAt: now };

  try {
    const result = await db.collection(COLLECTION).insertOne(document);

    return toSavedPoster({ _id: result.insertedId, ...document });
  } catch (error) {
    throw asNameTaken(error, input.name);
  }
}

/**
 * Réécrit une affiche que ce compte possède.
 *
 * Aucune limite ici : réécrire n'ajoute pas une affiche. Un compte dont
 * l'abonnement s'est arrêté garde donc les siennes utilisables, et n'est fermé
 * qu'à la création — voir `lib/posters/limits.ts`.
 */
export async function updatePoster(
  posterId: string,
  userId: string,
  input: SavedPosterInput,
): Promise<SavedPoster | null> {
  await indexesReady;

  if (!ObjectId.isValid(posterId)) {
    return null;
  }

  try {
    const result = await db
      .collection(COLLECTION)
      .findOneAndUpdate(
        { _id: new ObjectId(posterId), userId },
        { $set: { ...input, updatedAt: new Date() } },
        { returnDocument: "after" },
      );

    return result ? toSavedPoster(result) : null;
  } catch (error) {
    throw asNameTaken(error, input.name);
  }
}

export async function deletePoster(posterId: string, userId: string): Promise<boolean> {
  await indexesReady;

  if (!ObjectId.isValid(posterId)) {
    return false;
  }

  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(posterId), userId });

  return result.deletedCount > 0;
}

/**
 * Le conflit d'unicité de Mongo, traduit en erreur qu'un écran sait dire.
 *
 * L'index tranche plutôt qu'une lecture préalable : entre lire et écrire, deux
 * requêtes concurrentes passeraient toutes les deux.
 */
function asNameTaken(error: unknown, name: string): unknown {
  const duplicate = typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

  return duplicate ? new PosterNameTakenError(name) : error;
}
