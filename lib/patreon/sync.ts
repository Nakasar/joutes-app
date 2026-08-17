import 'server-only';

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ObjectId } from "mongodb";
import db from "@/lib/mongodb";
import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import { getSubscriptionByProviderUserId, upsertFromSnapshot } from "@/lib/db/subscriptions";
import type { SubscriptionSyncSource } from "@/lib/types/Subscription";
import type { User } from "@/lib/types/User";
import { fetchIdentity, fetchMember, type PatreonResult } from "./api";
import { patreonConfig, patreonPlanMapping } from "./config";
import { plansFromSnapshot, resolveMembership } from "./resolve";
import type { MembershipSnapshot, PatreonDocument } from "./types";

/**
 * La synchronisation : lire chez Patreon, résoudre, écrire la projection.
 *
 * Trois chemins y mènent — la liaison d'un compte, un webhook, le cron de
 * réconciliation — et tous convergent vers `applySnapshot`. C'est ce qui rend
 * l'ensemble idempotent : quel que soit le déclencheur, on relit la vérité et on
 * l'applique, plutôt que d'appliquer un delta dont l'ordre compterait.
 *
 * **Aucune de ces fonctions n'écrit sur un échec de lecture.** Un `PatreonResult`
 * en erreur ressort tel quel, sans toucher à la base : une panne d'API ne doit
 * jamais éteindre un abonnement.
 */

export const PATREON_PROVIDER_ID = "patreon";

export type SyncOutcome =
  | { ok: true; plansBefore: SubscriptionPlanKey[]; plansAfter: SubscriptionPlanKey[] }
  | { ok: false; reason: string };

/**
 * Écrit la projection d'un instantané et rend ce qui a changé.
 *
 * `plansBefore` / `plansAfter` servent au journal et, plus tard, à prévenir les
 * propriétaires d'un lieu dont le parrain s'est éteint.
 */
export async function applySnapshot({
  userId,
  snapshot,
  source,
}: {
  userId: User['id'];
  snapshot: MembershipSnapshot;
  source: SubscriptionSyncSource;
}): Promise<{ plansBefore: SubscriptionPlanKey[]; plansAfter: SubscriptionPlanKey[] }> {
  const plans = plansFromSnapshot(snapshot, patreonPlanMapping());

  const before = snapshot.patreonUserId
    ? await getSubscriptionByProviderUserId(snapshot.patreonUserId)
    : null;

  const after = await upsertFromSnapshot({ userId, snapshot, plans, source });

  return { plansBefore: before?.plans ?? [], plansAfter: after.plans };
}

/**
 * Resynchronise depuis le jeton du compte lui-même.
 *
 * C'est le chemin de la liaison OAuth et du bouton « resynchroniser » de la page
 * de compte. `auth.api.getAccessToken` rafraîchit le jeton au besoin — on n'écrit
 * aucune mécanique de refresh.
 */
export async function syncFromUserToken(userId: User['id'], source: SubscriptionSyncSource = "manual"): Promise<SyncOutcome> {
  if (!patreonConfig()) {
    return { ok: false, reason: "patreon-not-configured" };
  }

  let accessToken: string | undefined;

  try {
    const token = await auth.api.getAccessToken({
      body: { providerId: PATREON_PROVIDER_ID, userId },
      headers: await headers(),
    });
    accessToken = token?.accessToken;
  } catch {
    // Compte non lié, ou jeton irrécupérable : ce n'est pas une extinction.
    return { ok: false, reason: "not-linked" };
  }

  if (!accessToken) {
    return { ok: false, reason: "not-linked" };
  }

  return applyFromResult(userId, await fetchIdentity(accessToken), source);
}

/**
 * Resynchronise un membre depuis le jeton du créateur.
 *
 * Le chemin du webhook : sa charge utile dit qui a changé, cet appel dit ce
 * qu'il est devenu.
 */
export async function syncMemberFromCreatorToken(
  userId: User['id'],
  memberId: string,
  source: SubscriptionSyncSource = "webhook"
): Promise<SyncOutcome> {
  const config = patreonConfig();

  if (!config?.creatorAccessToken) {
    return { ok: false, reason: "no-creator-token" };
  }

  return applyFromResult(userId, await fetchMember(memberId, config.creatorAccessToken), source);
}

/**
 * Le seul endroit qui transforme un résultat d'API en écriture — et il ne le
 * fait que sur `ok: true`. C'est la garantie structurelle contre l'extinction en
 * masse : il n'y a pas d'autre porte.
 */
async function applyFromResult(
  userId: User['id'],
  result: PatreonResult<PatreonDocument>,
  source: SubscriptionSyncSource
): Promise<SyncOutcome> {
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  const snapshot = resolveMembership(result.data);

  if (!snapshot) {
    // Réponse illisible. « Je n'ai pas su lire » n'est pas « il n'a plus rien » :
    // on ne touche à rien.
    return { ok: false, reason: "unreadable-payload" };
  }

  const { plansBefore, plansAfter } = await applySnapshot({ userId, snapshot, source });

  return { ok: true, plansBefore, plansAfter };
}

/**
 * Le compte Joutes derrière un identifiant Patreon.
 *
 * Passe par la collection `account` de better-auth, comme la résolution d'un
 * identifiant Discord dans `app/discord/route.ts` : c'est elle qui porte le lien
 * entre un compte et un fournisseur.
 */
export async function findUserIdByPatreonId(patreonUserId: string): Promise<User['id'] | null> {
  const account = await db
    .collection<{ userId: unknown }>("account")
    .findOne({ providerId: PATREON_PROVIDER_ID, accountId: patreonUserId });

  return account?.userId ? String(account.userId) : null;
}

/**
 * L'identifiant Patreon lié à un compte, ou `null`.
 *
 * **C'est ici que se lit « mon compte Patreon est-il lié ? »**, et non dans
 * `subscriptions.providerUserId`. La distinction a coûté un blocage : cette
 * colonne-là n'est qu'une *projection*, écrite par une synchronisation réussie.
 * Tant qu'aucune n'avait abouti, l'écran de compte annonçait « non lié » à
 * quelqu'un que better-auth considérait comme lié — et lui proposait de lier de
 * nouveau, ce que better-auth refuse. Sans bouton « resynchroniser » (réservé
 * aux comptes « liés »), il n'y avait plus aucune sortie.
 *
 * La collection `account` est la seule autorité sur le lien lui-même.
 */
export async function findPatreonAccountId(userId: User['id']): Promise<string | null> {
  // `userId` y est écrit par l'adaptateur MongoDB de better-auth, qui le range
  // en `ObjectId`. On accepte les deux formes : une base migrée d'une version
  // antérieure peut porter la chaîne.
  const candidates: unknown[] = [userId];
  if (ObjectId.isValid(userId)) {
    candidates.push(new ObjectId(userId));
  }

  const account = await db
    .collection<{ accountId: unknown }>("account")
    .findOne({ providerId: PATREON_PROVIDER_ID, userId: { $in: candidates } });

  return account?.accountId ? String(account.accountId) : null;
}
