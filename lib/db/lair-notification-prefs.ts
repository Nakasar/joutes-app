import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import {
  lairNotificationPreference,
  toStoredLairNotificationPref,
  type LairNotificationPreference,
  type StoredLairNotificationPref,
} from "@/lib/lairs/notification-prefs";

/**
 * Les réglages de notification des lieux suivis, sur le compte.
 *
 * Les règles vivent dans `lib/lairs/notification-prefs.ts` ; ici, on lit et on
 * écrit `lairNotificationPrefs`, rien d'autre.
 */

const COLLECTION_NAME = "user";

type FollowStateDocument = {
  lairs?: string[];
  lairNotificationPrefs?: StoredLairNotificationPref[];
};

/** Les lieux suivis et leurs réglages, en une lecture projetée. */
export async function getLairFollowState(userId: string): Promise<{
  lairs: string[];
  prefs: StoredLairNotificationPref[];
} | null> {
  if (!ObjectId.isValid(userId)) return null;

  const doc = await db
    .collection<FollowStateDocument>(COLLECTION_NAME)
    .findOne(
      { _id: ObjectId.createFromHexString(userId) },
      { projection: { lairs: 1, lairNotificationPrefs: 1 } }
    );

  if (!doc) return null;
  return { lairs: doc.lairs ?? [], prefs: doc.lairNotificationPrefs ?? [] };
}

/** Le réglage d'un lieu pour ce compte. `null` s'il ne le suit pas. */
export async function getLairNotificationPreference(
  userId: string,
  lairId: string
): Promise<LairNotificationPreference | null> {
  const state = await getLairFollowState(userId);
  if (!state || !state.lairs.includes(lairId)) return null;
  return lairNotificationPreference(state.prefs, lairId);
}

/**
 * Règle ce qu'un abonné reçoit d'un lieu.
 *
 * Seulement s'il le suit : un réglage sur un lieu non suivi n'aurait rien à
 * régler, et resterait là quand il le suivra, alors qu'un lieu qu'on vient de
 * suivre doit partir en « Tout ».
 *
 * Une seule écriture, par pipeline : l'ancienne entrée du lieu est retirée et
 * la nouvelle ajoutée ensemble, sans fenêtre où deux envois concurrents
 * laisseraient deux entrées pour un même lieu.
 */
export async function setLairNotificationPreference(
  userId: string,
  lairId: string,
  preference: LairNotificationPreference
): Promise<boolean> {
  if (!ObjectId.isValid(userId)) return false;

  const stored = toStoredLairNotificationPref(lairId, preference);
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId), lairs: lairId },
    [
      {
        $set: {
          lairNotificationPrefs: {
            $concatArrays: [
              {
                $filter: {
                  input: { $ifNull: ["$lairNotificationPrefs", []] },
                  cond: { $ne: ["$$this.lairId", lairId] },
                },
              },
              stored ? [{ $literal: stored }] : [],
            ],
          },
        },
      },
    ]
  );

  return result.matchedCount > 0;
}
