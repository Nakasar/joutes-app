import 'server-only';

import { cache } from "react";
import db from "@/lib/mongodb";
import type { ObjectId } from "mongodb";
import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import { visibleStatuses, type StatusView } from "@/lib/achievements/status";
import { displayPlan } from "@/lib/subscriptions/entitlements";
import { effectivePlans, grantedPlanKeys } from "@/lib/subscriptions/grants";
import type { GrantedPlan } from "@/lib/types/Subscription";
import type { Achievement, AchievementWithUnlockInfo } from "@/lib/types/Achievement";
import { getUsersByIds } from "@/lib/db/users";

/** Le document d'un succès, tel qu'il est rangé — l'identifiant y est `_id`. */
type AchievementDocument = Omit<Achievement, "id"> & { _id: ObjectId };

/**
 * Les badges d'une liste de comptes, en un nombre fixe de requêtes.
 *
 * C'est la seule raison d'être de ce module : un badge se montre désormais à
 * côté de chaque pseudonyme — liste d'amis, membres d'un groupe, auteur d'une
 * actualité, partenaire d'échange. Aller les chercher un par un ferait un N+1 sur
 * chacune de ces listes, et deux sur celles qui affichent aussi les statuts.
 *
 * Trois lectures, quelle que soit la longueur de la liste : les abonnements, le
 * catalogue des succès marqués « statut », et les déblocages correspondants.
 *
 * **Le forçage de développement (`PATREON_DEV_FORCE_PLAN`) ne s'applique pas
 * ici.** Il vaut pour « mes » droits, pas pour ceux des autres : l'appliquer en
 * lot badgerait tout le monde du même palier, ce qui rendrait ces écrans
 * illisibles en aperçu. Un compte de développement voit donc son propre badge
 * forcé sur ses écrans de compte, et son badge réel dans les listes.
 */

export type UserBadges = {
  /** Le palier à montrer, ou `null` pour un compte sans abonnement. */
  plan: SubscriptionPlanKey | null;
  statuses: StatusView[];
};

export const NO_BADGES: UserBadges = { plan: null, statuses: [] };

/** Les badges de plusieurs comptes, indexés par identifiant. */
export async function getUserBadges(userIds: readonly string[]): Promise<Record<string, UserBadges>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) {
    return {};
  }

  const [plans, statuses] = await Promise.all([plansByUser(ids), statusesByUser(ids)]);

  return Object.fromEntries(
    ids.map((id) => [id, { plan: plans[id] ?? null, statuses: statuses[id] ?? [] }])
  );
}

/**
 * Les badges d'un seul compte.
 *
 * Mémoïsé le temps d'une requête — une page de détail peut afficher le même
 * auteur à deux endroits. `cache()` de React, et non un mémo de module : sur un
 * conteneur chaud, celui-ci ferait fuiter les badges d'un visiteur au suivant.
 */
export const getBadgesForUser = cache(async (userId: string): Promise<UserBadges> => {
  const badges = await getUserBadges([userId]);
  return badges[userId] ?? NO_BADGES;
});

async function plansByUser(userIds: string[]): Promise<Record<string, SubscriptionPlanKey | null>> {
  const docs = await db
    .collection<{ userId: string; plans?: SubscriptionPlanKey[]; grantedPlans?: GrantedPlan[] }>(
      "subscriptions"
    )
    .find({ userId: { $in: userIds } }, { projection: { userId: 1, plans: 1, grantedPlans: 1 } })
    .toArray();

  return Object.fromEntries(
    docs.map((doc) => [
      doc.userId,
      // Payés et offerts composés, comme partout ailleurs : un palier offert par
      // l'équipe donne exactement le même badge qu'un palier payé.
      displayPlan(
        effectivePlans({
          paid: doc.plans ?? [],
          granted: grantedPlanKeys(doc.grantedPlans ?? []),
        })
      ),
    ])
  );
}

async function statusesByUser(userIds: string[]): Promise<Record<string, StatusView[]>> {
  // Les succès marqués « statut » : une poignée, tout au plus. On les lit en
  // entier plutôt que de les joindre, c'est moins cher que la jointure.
  const statusAchievements = await db
    .collection<AchievementDocument>("achievements")
    .find({ isStatus: true })
    .toArray();

  if (statusAchievements.length === 0) {
    return {};
  }

  const byId = new Map(statusAchievements.map((doc) => [doc._id.toString(), doc]));

  const unlocks = await db
    .collection<{ userId: string; achievementId: string; unlockedAt: Date }>("user-achievements")
    .find({ userId: { $in: userIds }, achievementId: { $in: [...byId.keys()] } })
    .toArray();

  const perUser: Record<string, AchievementWithUnlockInfo[]> = {};

  for (const unlock of unlocks) {
    const doc = byId.get(unlock.achievementId);
    if (!doc) continue;

    const { _id, ...achievement } = doc;
    void _id;

    (perUser[unlock.userId] ??= []).push({
      ...achievement,
      id: unlock.achievementId,
      unlockedAt: unlock.unlockedAt,
    });
  }

  // `visibleStatuses` porte le tri et le plafond : les mêmes ici que sur un
  // profil, sans quoi le même compte s'afficherait différemment selon l'écran.
  return Object.fromEntries(
    Object.entries(perUser).map(([userId, achievements]) => [userId, visibleStatuses(achievements)])
  );
}

/**
 * Attache leurs badges à une liste de profils publics.
 *
 * C'est la porte à utiliser : elle prend la liste qu'un écran s'apprête à
 * rendre et la rend enrichie, en un nombre de requêtes qui ne dépend pas de sa
 * longueur. Les profils sont recopiés plutôt que modifiés — un appelant peut
 * tenir la même référence ailleurs.
 */
export async function withUserBadges<T extends { id: string }>(users: T[]): Promise<(T & { badges: UserBadges })[]> {
  const badges = await getUserBadges(users.map((user) => user.id));
  return users.map((user) => ({ ...user, badges: badges[user.id] ?? NO_BADGES }));
}

/**
 * L'auteur d'un contenu : de quoi l'écrire, et ses badges.
 *
 * Les erratas, les politiques, les cubes et les listes ne rangent qu'un
 * identifiant de compte. Ils ont donc tous le même besoin — un nom lisible et
 * des badges, pour un lot d'identifiants —, et le résoudre chacun de leur côté
 * finirait par donner autant de formats d'auteur que de fonctionnalités.
 */
export type AuthorSummary = {
  id: string;
  username: string;
  displayName?: string;
  discriminator?: string;
  badges: UserBadges;
};

export async function getAuthorSummaries(
  userIds: readonly string[]
): Promise<Record<string, AuthorSummary>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) {
    return {};
  }

  const [users, badges] = await Promise.all([getUsersByIds(ids), getUserBadges(ids)]);

  return Object.fromEntries(
    users.map((user) => [
      user.id,
      {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        discriminator: user.discriminator,
        badges: badges[user.id] ?? NO_BADGES,
      },
    ])
  );
}

/** Idem, pour un profil seul ou absent. */
export async function withBadges<T extends { id: string }>(user: T | null): Promise<(T & { badges: UserBadges }) | null> {
  if (!user) return null;
  return { ...user, badges: await getBadgesForUser(user.id) };
}
