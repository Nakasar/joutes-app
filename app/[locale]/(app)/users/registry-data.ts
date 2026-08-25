import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";

import { auth } from "@/lib/auth.ts";
import { getUserBadges, NO_BADGES } from "@/lib/db/user-badges.ts";
import { getUserById, readNearbyPublicUsers } from "@/lib/db/users.ts";
import { plansForUserId } from "@/lib/subscriptions/access.ts";
import { grantsEntitlement } from "@/lib/subscriptions/entitlements.ts";
import { readShowcaseCompletion } from "@/lib/users/completion.ts";
import type { RegistryFilters } from "@/lib/users/registry-search.ts";
import {
  listLiveShowcases,
  readAchievementsLeaderboard,
  searchRegistry,
} from "@/lib/users/registry.ts";

/**
 * Ce que le registre de la communauté lit, une fois par rendu.
 *
 * Même mécanique que `lair-data.ts` : chaque bloc réclame ce dont il a besoin,
 * et `cache` de React fait que la page ne le paie qu'une fois.
 *
 * Les lectures elles-mêmes vivent dans `lib/users/registry.ts`, que l'API
 * partage : ce module n'en est plus que la façade — il fournit le visiteur de
 * la session, ouvre la frontière de rendu dynamique et mémoïse.
 */

export type { RegistryEntry } from "@/lib/users/registry.ts";

/** Qui regarde le registre. */
export const readRegistryViewer = cache(async () => {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  const viewerId = session?.user?.id ?? null;

  return { viewerId, isAuthenticated: Boolean(viewerId) };
});


/** Les comptes qui diffusent en ce moment et l'annoncent sur leur profil. */
export const readLiveNow = cache(async () => {
  await connection();

  return await listLiveShowcases();
});

/** Les fiches du registre, pour le visiteur courant. */
export const readRegistry = cache(async (filters: RegistryFilters) => {
  await connection();

  const viewer = await readRegistryViewer();

  return await searchRegistry(filters, viewer.viewerId);
});

/** Le classement des succès, et le rang du visiteur. */
export const readLeaderboard = cache(async () => {
  await connection();

  const viewer = await readRegistryViewer();

  return await readAchievementsLeaderboard(viewer.viewerId);
});

/** Les joueurs de la même commune que le visiteur. */
export const readNearby = cache(async () => {
  await connection();

  const viewer = await readRegistryViewer();
  if (!viewer.viewerId) {
    return null;
  }

  const me = await getUserById(viewer.viewerId);
  const city = me?.location?.city;

  if (!city) {
    return null;
  }

  const users = await readNearbyPublicUsers({ city, excludeUserId: me.id, limit: 6 });
  const badges = await getUserBadges(users.map((user) => user.id));

  return {
    city,
    users: users.map((user) => ({ user, badges: badges[user.id] ?? NO_BADGES })),
  };
});

/** La carte « Votre profil » de la colonne de droite. */
export const readOwnSummary = cache(async () => {
  await connection();

  const viewer = await readRegistryViewer();
  if (!viewer.viewerId) {
    return null;
  }

  const [me, badges, plans] = await Promise.all([
    getUserById(viewer.viewerId),
    getUserBadges([viewer.viewerId]),
    plansForUserId(viewer.viewerId),
  ]);

  if (!me) {
    return null;
  }

  return {
    user: me,
    badges: badges[me.id] ?? NO_BADGES,
    completion: readShowcaseCompletion({
      hasDisplayName: Boolean(me.displayName),
      hasAvatar: Boolean(me.profileImage || me.avatar),
      hasDescription: Boolean(me.description),
      hasBanner: Boolean(me.showcase?.banner),
      canUseBanner: grantsEntitlement(plans, "sub:profile-banner"),
      followedGames: me.games?.length ?? 0,
      followedLairs: me.lairs?.length ?? 0,
      isPublic: me.isPublicProfile === true,
    }),
  };
});
