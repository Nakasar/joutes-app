"use server";

import { requireAdmin } from "@/lib/middleware/admin";
import { unlockAchievementById } from "@/lib/db/achievements";
import { revalidatePath } from "next/cache";

export async function unlockAchievementForUserAction(userId: string, achievementId: string) {
  await requireAdmin();

  try {
    const success = await unlockAchievementById(userId, achievementId);

    if (!success) {
      return {
        success: false,
        error: "Le succès est déjà débloqué ou n'existe pas"
      };
    }

    revalidatePath(`/users/${userId}`);
    revalidatePath(`/account/achievements`);

    return { success: true };
  } catch (error) {
    console.error("Error unlocking achievement for user:", error);
    return {
      success: false,
      error: "Erreur lors du déblocage du succès"
    };
  }
}

