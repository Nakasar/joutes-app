"use server";

import { requireAdmin } from "@/lib/middleware/admin.ts";
import { revokeAchievementById, unlockAchievementById } from "@/lib/db/achievements.ts";
import { grantPlan, revokeGrantedPlan } from "@/lib/db/subscriptions.ts";
import { isSubscriptionPlanKey, type SubscriptionPlanKey } from "@/lib/constants/subscription-plans.ts";
import { revalidatePath } from "next/cache";

/**
 * Les actions d'administration qui s'exercent sur un compte, depuis sa page de
 * profil — le seul endroit où l'on agit sur quelqu'un en particulier.
 * `/admin/users` reste une recherche qui y renvoie.
 *
 * Toutes commencent par `requireAdmin()` : le rendu conditionnel côté serveur
 * n'est qu'une commodité d'affichage, le vrai contrôle est ici.
 *
 * **Sur la revalidation** : la route du profil est `/[locale]/users/[userTagOrId]`,
 * et on y arrive presque toujours par le pseudonyme, pas par l'identifiant.
 * `revalidatePath('/users/' + userId)` n'invalidait donc jamais la page que les
 * gens regardent. On invalide le motif de route, ce qui couvre les deux formes.
 *
 * Le `[locale]` de tête n'est pas décoratif : ce chemin désigne la **structure
 * de fichiers de routes** et non l'URL, que next-intl réécrit pour servir le
 * français sans préfixe. Sans lui, le motif ne désignait aucune route.
 */

function revalidateProfil() {
  revalidatePath("/[locale]/users/[userTagOrId]", "page");
  revalidatePath("/account/achievements");
  revalidatePath("/account/subscription");
}

export async function unlockAchievementForUserAction(userId: string, achievementId: string) {
  await requireAdmin();

  try {
    const outcome = await unlockAchievementById(userId, achievementId);

    if (outcome !== "unlocked") {
      return { success: false as const, error: outcome };
    }

    revalidateProfil();

    return { success: true as const };
  } catch (error) {
    console.error("Error unlocking achievement for user:", error);
    return { success: false as const, error: "unexpected" };
  }
}

/** Retire un succès — ou un statut, qui n'en est qu'une variété. */
export async function revokeAchievementForUserAction(userId: string, achievementId: string) {
  await requireAdmin();

  try {
    const revoked = await revokeAchievementById(userId, achievementId);

    if (!revoked) {
      return { success: false as const, error: "not-unlocked" };
    }

    revalidateProfil();

    return { success: true as const };
  } catch (error) {
    console.error("Error revoking achievement for user:", error);
    return { success: false as const, error: "unexpected" };
  }
}

/**
 * Offre un palier à un compte.
 *
 * Le motif est exigé ici et pas seulement dans le formulaire : une action
 * serveur est appelable directement, et un octroi sans raison est exactement ce
 * qu'on ne saura pas expliquer plus tard.
 */
export async function grantPlanToUserAction(
  userId: string,
  plan: SubscriptionPlanKey,
  reason: string
) {
  const session = await requireAdmin();

  if (!isSubscriptionPlanKey(plan)) {
    return { success: false as const, error: "invalid-plan" };
  }

  const motif = reason.trim();

  if (motif.length === 0) {
    return { success: false as const, error: "reason-required" };
  }

  try {
    const granted = await grantPlan({
      userId,
      plan,
      grantedBy: session.user.id,
      reason: motif,
    });

    if (!granted) {
      return { success: false as const, error: "already-granted" };
    }

    revalidateProfil();

    return { success: true as const };
  } catch (error) {
    console.error("Error granting plan to user:", error);
    return { success: false as const, error: "unexpected" };
  }
}

export async function revokeGrantedPlanFromUserAction(userId: string, plan: SubscriptionPlanKey) {
  await requireAdmin();

  if (!isSubscriptionPlanKey(plan)) {
    return { success: false as const, error: "invalid-plan" };
  }

  try {
    const revoked = await revokeGrantedPlan({ userId, plan });

    if (!revoked) {
      return { success: false as const, error: "not-granted" };
    }

    revalidateProfil();

    return { success: true as const };
  } catch (error) {
    console.error("Error revoking granted plan:", error);
    return { success: false as const, error: "unexpected" };
  }
}
