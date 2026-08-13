import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId, WithId, Document } from "mongodb";

/**
 * La file des fan-outs trop gros pour tenir dans une invocation.
 *
 * La plupart des notifications Joutes touchent une poignée de destinataires :
 * elles partent tout de suite, après la réponse HTTP. Restent les annonces d'un
 * lair très suivi, qui peuvent faire sonner des milliers de téléphones — et
 * qu'aucune fonction serverless ne dépilera d'un trait.
 *
 * D'où cette file, volontairement minimale : une collection MongoDB, un
 * curseur, un cron. Pas de service externe pour un cas qui se compte en
 * quelques documents par semaine.
 */

const COLLECTION_NAME = "push_jobs";

export type PushJobState = "pending" | "sending" | "done" | "failed";

export type PushJob = {
  id: string;
  notificationId: string;
  state: PushJobState;
  /** Identifiant du dernier appareil traité : la reprise repart de là. */
  cursor: string | null;
  sent: number;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};

/** Au-delà, on cesse de s'acharner et on laisse une trace. */
export const MAX_PUSH_JOB_ATTEMPTS = 5;

function toPushJob(doc: WithId<Document>): PushJob {
  return {
    id: doc._id.toString(),
    notificationId: doc.notificationId,
    state: doc.state,
    cursor: doc.cursor ?? null,
    sent: doc.sent ?? 0,
    attempts: doc.attempts ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastError: doc.lastError || undefined,
  };
}

/**
 * Met une notification en file. Idempotent : deux appels pour la même
 * notification ne créent qu'un travail, ce qui évite de la pousser deux fois
 * si l'envoi immédiat et la file se croisent.
 */
export async function enqueuePushJob(notificationId: string): Promise<void> {
  const now = new Date().toISOString();

  await db.collection(COLLECTION_NAME).updateOne(
    { notificationId },
    {
      $setOnInsert: {
        notificationId,
        state: "pending" as const,
        cursor: null,
        sent: 0,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true }
  );
}

/**
 * Réclame le prochain travail à dépiler.
 *
 * La transition `pending → sending` est un `findOneAndUpdate` : c'est ce qui
 * fait qu'un cron qui déborde sur l'exécution suivante n'envoie pas deux fois.
 * Un `find` puis un `update` laisseraient la fenêtre ouverte.
 */
export async function claimPushJob(): Promise<PushJob | null> {
  const doc = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { state: "pending" },
    { $set: { state: "sending", updatedAt: new Date().toISOString() }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );

  return doc ? toPushJob(doc) : null;
}

/**
 * Le travail reste à faire : on note où on s'est arrêté et on le rend à la
 * file. L'exécution suivante reprendra au curseur.
 */
export async function suspendPushJob(jobId: string, cursor: string, sent: number): Promise<void> {
  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(jobId) },
    { $set: { state: "pending", cursor, updatedAt: new Date().toISOString() }, $inc: { sent } }
  );
}

export async function finishPushJob(jobId: string, sent: number): Promise<void> {
  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(jobId) },
    { $set: { state: "done", updatedAt: new Date().toISOString() }, $inc: { sent } }
  );
}

/**
 * Un travail qui a trop échoué s'arrête là. Le laisser tourner indéfiniment
 * ferait payer à chaque exécution du cron une notification que personne ne
 * recevra.
 */
export async function failPushJob(jobId: string, error: string): Promise<void> {
  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(jobId) },
    { $set: { state: "failed", lastError: error.slice(0, 300), updatedAt: new Date().toISOString() } }
  );
}

/** Rend un travail à la file après un échec passager. */
export async function releasePushJob(jobId: string, error: string): Promise<void> {
  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(jobId) },
    { $set: { state: "pending", lastError: error.slice(0, 300), updatedAt: new Date().toISOString() } }
  );
}
