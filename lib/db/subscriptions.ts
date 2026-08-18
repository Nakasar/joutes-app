import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId, type Document, type WithId } from "mongodb";
import { isSubscriptionPlanKey, type SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import { effectivePlans, grantedPlanKeys } from "@/lib/subscriptions/grants";
import type { MembershipSnapshot } from "@/lib/patreon/types";
import type { Lair } from "@/lib/types/Lair";
import type { GrantedPlan, Subscription, SubscriptionSeat, SubscriptionSyncSource } from "@/lib/types/Subscription";
import type { User } from "@/lib/types/User";

const COLLECTION_NAME = "subscriptions";

/**
 * Le document tel qu'il vit en base. Typer la collection n'est pas cosmétique :
 * sans cela, le pilote refuse `$push` et `$pull` sur `seats`, qu'il ne sait pas
 * reconnaître comme un tableau.
 */
export type SubscriptionDocument = Omit<Subscription, "id"> & { _id: ObjectId };

/**
 * Les abonnements en base. Lecture partout, écriture uniquement depuis la
 * synchronisation Patreon et depuis le rattachement d'un lieu.
 *
 * Ce module ne décide rien : le calcul des droits vit dans
 * `lib/subscriptions/entitlements.ts`, qui est pur et testé. Ici, on lit et on
 * écrit des documents.
 */

/**
 * Les index, créés une fois par instance.
 *
 * Il n'y a **aucun système de migration** dans ce dépôt : sans cette promesse,
 * rien ne créerait ces index, et l'unicité du siège — l'invariant qui garantit
 * qu'un lieu n'est parrainé que par un seul abonnement — n'existerait tout
 * simplement pas. `createIndex` est idempotent. Même motif que
 * `lib/db/trades.ts`.
 */
const indexesReady = Promise.all([
  db.collection(COLLECTION_NAME).createIndex({ userId: 1 }, { unique: true }),
  db.collection(COLLECTION_NAME).createIndex(
    { providerUserId: 1 },
    { unique: true, partialFilterExpression: { providerUserId: { $type: "string" } } }
  ),
  db.collection(COLLECTION_NAME).createIndex(
    { "seats.lairId": 1 },
    { unique: true, partialFilterExpression: { "seats.lairId": { $exists: true } } }
  ),
]).catch((error) => {
  console.error("Impossible de créer les index des abonnements:", error);
});

function collection() {
  return db.collection<SubscriptionDocument>(COLLECTION_NAME);
}

function toSubscription(doc: WithId<Document>): Subscription {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    provider: "patreon",
    providerUserId: doc.providerUserId ?? null,
    providerMemberId: doc.providerMemberId ?? null,
    // Un plan inconnu — écrit par une version antérieure, ou à la main — ne doit
    // pas remonter jusqu'au calcul des droits.
    plans: (doc.plans ?? []).filter(isSubscriptionPlanKey),
    seats: (doc.seats ?? []) as SubscriptionSeat[],
    // Même défense que pour `plans` : un palier inconnu ne doit pas remonter
    // jusqu'au calcul des droits, quelle que soit la porte par laquelle il entre.
    grantedPlans: ((doc.grantedPlans ?? []) as GrantedPlan[]).filter((granted) =>
      isSubscriptionPlanKey(granted?.plan)
    ),
    entitledTierIds: doc.entitledTierIds ?? [],
    entitledAmountCents: doc.entitledAmountCents ?? 0,
    patronStatus: doc.patronStatus ?? null,
    lastChargeStatus: doc.lastChargeStatus ?? null,
    syncedAt: doc.syncedAt,
    syncSource: doc.syncSource ?? "manual",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function getSubscriptionByUserId(userId: User['id']): Promise<Subscription | null> {
  await indexesReady;
  const doc = await collection().findOne({ userId });
  return doc ? toSubscription(doc) : null;
}

/**
 * Les paliers effectifs de plusieurs comptes, en une lecture.
 *
 * Pour tout ce qui raisonne sur un groupe de gens : les badges d'une liste, ou
 * « un membre de ce groupe est-il abonné ? ». Les interroger un par un ferait un
 * N+1 dont la longueur suit celle du groupe.
 *
 * Payés et offerts composés, comme partout ailleurs — un palier offert par
 * l'équipe vaut exactement un palier payé. Le forçage de développement, lui, ne
 * s'applique pas ici : il vaut pour « mes » droits, et l'appliquer en lot
 * donnerait le même palier à tout le monde.
 */
export async function getPlansByUserIds(
  userIds: readonly User['id'][]
): Promise<Record<string, SubscriptionPlanKey[]>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) {
    return {};
  }

  const docs = await collection()
    .find({ userId: { $in: ids } }, { projection: { userId: 1, plans: 1, grantedPlans: 1 } })
    .toArray();

  return Object.fromEntries(
    docs.map((doc) => [
      doc.userId,
      effectivePlans({
        paid: (doc.plans ?? []).filter(isSubscriptionPlanKey),
        granted: grantedPlanKeys(
          ((doc.grantedPlans ?? []) as GrantedPlan[]).filter((granted) =>
            isSubscriptionPlanKey(granted?.plan)
          )
        ),
      }),
    ])
  );
}

export async function getSubscriptionByProviderUserId(
  providerUserId: string
): Promise<Subscription | null> {
  await indexesReady;
  const doc = await collection().findOne({ providerUserId });
  return doc ? toSubscription(doc) : null;
}

/**
 * L'abonnement qui parraine ce lieu, s'il en existe un.
 *
 * Ne dit rien de son état : c'est l'appelant qui vérifie que ses `plans`
 * ouvrent bien le droit. C'est exactement le point où la fin d'abonnement
 * devient gratuite — le siège est toujours là, mais l'abonnement ne porte plus
 * rien, et le lieu perd Pro sans qu'aucune révocation n'ait tourné.
 */
export async function getSubscriptionForLair(lairId: Lair['id']): Promise<Subscription | null> {
  await indexesReady;
  const doc = await collection().findOne({ "seats.lairId": lairId });
  return doc ? toSubscription(doc) : null;
}

/**
 * Les lieux parrainés par un abonnement portant ce plan, parmi ceux demandés.
 *
 * À utiliser dès qu'on affiche une liste : boucler sur une vérification par
 * lieu ferait un N+1 sur la page d'index des lieux. C'est aussi la raison pour
 * laquelle aucun miroir n'est recopié sur le document du lieu — le seul problème
 * qu'il aurait résolu se règle par cet appel groupé, sans le risque d'un
 * document périmé qui accorderait un droit pour toujours.
 */
export async function getLairIdsWithPlan(
  lairIds: Lair['id'][],
  plan: SubscriptionPlanKey
): Promise<Set<Lair['id']>> {
  if (lairIds.length === 0) {
    return new Set();
  }

  await indexesReady;

  const docs = await collection()
    .find(
      {
        // Payé **ou** offert : un palier accordé par l'équipe ouvre les mêmes
        // droits, y compris pour les lieux qu'il parraine.
        $or: [{ plans: plan }, { "grantedPlans.plan": plan }],
        "seats.lairId": { $in: lairIds },
      },
      { projection: { seats: 1 } }
    )
    .toArray();

  const wanted = new Set(lairIds);
  const found = new Set<Lair['id']>();

  for (const doc of docs) {
    for (const seat of (doc.seats ?? []) as SubscriptionSeat[]) {
      if (wanted.has(seat.lairId)) {
        found.add(seat.lairId);
      }
    }
  }

  return found;
}

/**
 * Écrit la projection d'un instantané Patreon.
 *
 * **N'est appelée que sur une lecture réussie.** Il n'existe volontairement
 * aucun chemin depuis « la requête a échoué » jusqu'ici : une panne d'API
 * interprétée comme « aucun palier » éteindrait tous les abonnés d'un coup.
 * Voir `lib/patreon/api.ts`, dont les fonctions rendent un résultat discriminé.
 *
 * Les sièges ne sont jamais touchés : ils enregistrent une intention, pas un
 * droit, et survivent donc à une extinction comme à une reprise.
 */
export async function upsertFromSnapshot({
  userId,
  snapshot,
  plans,
  source,
}: {
  userId: User['id'];
  snapshot: MembershipSnapshot;
  plans: SubscriptionPlanKey[];
  source: SubscriptionSyncSource;
}): Promise<Subscription> {
  await indexesReady;

  const now = new Date();

  const doc = await collection().findOneAndUpdate(
    { userId },
    {
      // ⚠️ Ne JAMAIS ajouter `grantedPlans` ni `seats` à ce `$set`.
      //
      // Toute la protection des paliers offerts tient à leur absence ici :
      // MongoDB laisse intact un champ qu'on ne lui demande pas d'écrire. Les y
      // ajouter « par symétrie » recopierait la projection Patreon par-dessus un
      // octroi manuel, et l'effacerait au premier webhook venu — sans que rien
      // ne le signale, puisque la synchronisation aurait « réussi ».
      $set: {
        provider: "patreon",
        providerUserId: snapshot.patreonUserId,
        providerMemberId: snapshot.memberId,
        plans,
        entitledTierIds: snapshot.entitledTierIds,
        entitledAmountCents: snapshot.entitledAmountCents,
        patronStatus: snapshot.patronStatus,
        lastChargeStatus: snapshot.lastChargeStatus,
        syncedAt: now,
        syncSource: source,
        updatedAt: now,
      },
      $setOnInsert: { userId, seats: [], grantedPlans: [], createdAt: now },
    },
    { upsert: true, returnDocument: "after" }
  );

  return toSubscription(doc!);
}

/**
 * Rattache un lieu, en une seule écriture gardée.
 *
 * Toutes les conditions sont dans le filtre plutôt que dans une lecture
 * préalable : lire puis écrire laisserait deux requêtes simultanées franchir la
 * borne de sièges. `false` signifie « une des conditions n'était pas remplie » —
 * l'appelant relit alors pour produire le bon message, mais seulement sur ce
 * chemin d'échec.
 */
export async function attachLairSeat({
  userId,
  lairId,
  maxSeats,
  plan,
}: {
  userId: User['id'];
  lairId: Lair['id'];
  maxSeats: number;
  plan: SubscriptionPlanKey;
}): Promise<boolean> {
  if (maxSeats <= 0) {
    return false;
  }

  await indexesReady;

  try {
    const result = await collection().updateOne(
      {
        userId,
        plans: plan,
        "seats.lairId": { $ne: lairId },
        // « le tableau compte moins de maxSeats éléments »
        [`seats.${maxSeats - 1}`]: { $exists: false },
      },
      {
        $push: { seats: { lairId, attachedAt: new Date(), attachedBy: userId } },
        $set: { updatedAt: new Date() },
      }
    );

    return result.modifiedCount === 1;
  } catch (error) {
    // L'index unique sur `seats.lairId` : le lieu est déjà parrainé par un
    // autre abonnement. C'est un refus, pas une panne.
    if ((error as { code?: number }).code === 11000) {
      return false;
    }
    throw error;
  }
}

/**
 * Détache un lieu. Ouvert à tout propriétaire du lieu, et pas au seul compte
 * qui l'a rattaché : sinon un gérant parti garderait le lieu en otage.
 */
export async function detachLairSeat(lairId: Lair['id']): Promise<boolean> {
  await indexesReady;

  const result = await collection().updateOne(
    { "seats.lairId": lairId },
    { $pull: { seats: { lairId } }, $set: { updatedAt: new Date() } }
  );

  return result.modifiedCount === 1;
}

/**
 * Coupe le lien vers Patreon et éteint les droits.
 *
 * Appelée quand un compte délie Patreon : sans cela, le droit survivrait à sa
 * preuve. Les sièges restent — le compte peut relier son Patreon et retrouver
 * ses lieux.
 *
 * **Les paliers offerts restent aussi**, et ce n'est pas un oubli : délier
 * Patreon ne prouve rien sur un palier accordé à la main. C'est précisément le
 * cas du bêta-testeur qui n'a jamais eu de compte Patreon.
 */
export async function clearProviderLink(userId: User['id']): Promise<void> {
  await indexesReady;

  await collection().updateOne(
    { userId },
    {
      $set: {
        providerUserId: null,
        providerMemberId: null,
        plans: [],
        entitledTierIds: [],
        entitledAmountCents: 0,
        patronStatus: null,
        lastChargeStatus: null,
        syncedAt: new Date(),
        syncSource: "manual",
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Offre un palier à un compte.
 *
 * En **upsert**, parce que la personne peut n'avoir aucun document — offrir un
 * palier à quelqu'un qui n'a jamais lié Patreon est même le cas courant.
 *
 * `false` signifie « ce palier lui est déjà offert ». Deux chemins y mènent, et
 * le second surprend : quand le document existe *et* porte déjà ce palier, le
 * filtre ne matche pas, MongoDB tente donc l'insertion prévue par l'upsert, et
 * l'index unique sur `userId` la refuse par un E11000. C'est un refus, pas une
 * panne — même traitement que dans `attachLairSeat` plus haut.
 */
export async function grantPlan({
  userId,
  plan,
  grantedBy,
  reason,
}: {
  userId: User['id'];
  plan: SubscriptionPlanKey;
  grantedBy: User['id'];
  reason: string;
}): Promise<boolean> {
  await indexesReady;

  const now = new Date();

  try {
    const result = await collection().updateOne(
      { userId, "grantedPlans.plan": { $ne: plan } },
      {
        $push: { grantedPlans: { plan, grantedAt: now, grantedBy, reason } },
        $set: { updatedAt: now },
        $setOnInsert: {
          userId,
          provider: "patreon",
          providerUserId: null,
          providerMemberId: null,
          plans: [],
          seats: [],
          entitledTierIds: [],
          entitledAmountCents: 0,
          patronStatus: null,
          lastChargeStatus: null,
          syncedAt: now,
          syncSource: "manual",
          createdAt: now,
        },
      },
      { upsert: true }
    );

    return result.modifiedCount === 1 || result.upsertedCount === 1;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return false;
    }
    throw error;
  }
}

/** Retire un palier offert. Ne touche jamais aux paliers venus de Patreon. */
export async function revokeGrantedPlan({
  userId,
  plan,
}: {
  userId: User['id'];
  plan: SubscriptionPlanKey;
}): Promise<boolean> {
  await indexesReady;

  const result = await collection().updateOne(
    { userId },
    { $pull: { grantedPlans: { plan } }, $set: { updatedAt: new Date() } }
  );

  return result.modifiedCount === 1;
}

/** Les abonnements dont le compte lié n'existe plus. Rattrapage du cron. */
export async function getLinkedProviderUserIds(): Promise<{ userId: string; providerUserId: string }[]> {
  await indexesReady;

  const docs = await collection()
    .find({ providerUserId: { $type: "string" } }, { projection: { userId: 1, providerUserId: 1 } })
    .toArray();

  // Le filtre `$type: "string"` l'a déjà garanti ; le typage du pilote ne le
  // sait pas, d'où le tri explicite plutôt qu'une assertion.
  return docs.flatMap((doc) =>
    doc.providerUserId ? [{ userId: doc.userId, providerUserId: doc.providerUserId }] : []
  );
}

export { ObjectId };
