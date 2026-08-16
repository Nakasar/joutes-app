import 'server-only';

import crypto from "node:crypto";
import db from "@/lib/mongodb";
import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import type { SubscriptionSyncSource } from "@/lib/types/Subscription";

const COLLECTION_NAME = "subscription_events";

/**
 * Le journal des signaux d'abonnement reçus.
 *
 * Il sert deux choses d'un coup. **L'idempotence** : Patreon réémet une
 * livraison qu'il croit perdue, et l'index unique sur l'empreinte de la charge
 * utile transforme le doublon en erreur de clé, donc en non-événement.
 * **L'enquête** : quand quelqu'un affirme avoir payé et n'avoir rien reçu, ce
 * journal dit ce qui est arrivé, quand, et ce que ses droits valaient avant et
 * après.
 *
 * Purement informatif : aucune logique métier ne s'y adosse, et un échec
 * d'écriture ne doit pas faire échouer la synchronisation — même règle que le
 * journal d'activité des tournois.
 */

export type SubscriptionEvent = {
  provider: "patreon";
  trigger: string;
  payloadHash: string;
  providerUserId: string | null;
  providerMemberId: string | null;
  plansBefore: SubscriptionPlanKey[];
  plansAfter: SubscriptionPlanKey[];
  applied: boolean;
  error?: string;
  source: SubscriptionSyncSource;
  receivedAt: Date;
};

const indexesReady = Promise.all([
  db.collection(COLLECTION_NAME).createIndex({ provider: 1, payloadHash: 1 }, { unique: true }),
  db.collection(COLLECTION_NAME).createIndex({ providerUserId: 1, receivedAt: -1 }),
  // Le journal se purge tout seul : il sert à enquêter sur des faits récents,
  // pas à tenir une comptabilité.
  db.collection(COLLECTION_NAME).createIndex(
    { receivedAt: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60 }
  ),
]).catch((error) => {
  console.error("Impossible de créer les index du journal d'abonnements:", error);
});

/**
 * L'empreinte d'une livraison.
 *
 * Le déclencheur entre dans le calcul : Patreon peut envoyer la même charge
 * utile pour `members:update` et `members:pledge:update`, et ce sont deux
 * signaux, pas un doublon.
 */
export function payloadHash(trigger: string, rawBody: string): string {
  return crypto.createHash("sha256").update(`${trigger}\n${rawBody}`, "utf8").digest("hex");
}

/**
 * Enregistre une livraison. Rend `false` si elle avait déjà été traitée.
 *
 * L'écriture a lieu **avant** la synchronisation, pour que deux livraisons
 * simultanées ne se croisent pas : la seconde heurte l'index unique et
 * s'arrête là.
 */
export async function claimEvent({
  trigger,
  hash,
  source,
}: {
  trigger: string;
  hash: string;
  source: SubscriptionSyncSource;
}): Promise<boolean> {
  await indexesReady;

  try {
    await db.collection(COLLECTION_NAME).insertOne({
      provider: "patreon",
      trigger,
      payloadHash: hash,
      providerUserId: null,
      providerMemberId: null,
      plansBefore: [],
      plansAfter: [],
      applied: false,
      source,
      receivedAt: new Date(),
    });

    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return false;
    }
    throw error;
  }
}

/** Complète la ligne une fois la synchronisation faite (ou échouée). */
export async function completeEvent({
  hash,
  providerUserId,
  providerMemberId,
  plansBefore,
  plansAfter,
  applied,
  error,
}: {
  hash: string;
  providerUserId?: string | null;
  providerMemberId?: string | null;
  plansBefore?: SubscriptionPlanKey[];
  plansAfter?: SubscriptionPlanKey[];
  applied: boolean;
  error?: string;
}): Promise<void> {
  await indexesReady;

  try {
    await db.collection(COLLECTION_NAME).updateOne(
      { provider: "patreon", payloadHash: hash },
      {
        $set: {
          providerUserId: providerUserId ?? null,
          providerMemberId: providerMemberId ?? null,
          plansBefore: plansBefore ?? [],
          plansAfter: plansAfter ?? [],
          applied,
          ...(error ? { error } : {}),
        },
      }
    );
  } catch (writeError) {
    // Le journal ne doit jamais faire échouer ce qu'il journalise.
    console.error("Impossible de compléter le journal d'abonnement:", writeError);
  }
}
