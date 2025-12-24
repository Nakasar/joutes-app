"use server";

import { createAchievement, updateAchievement, deleteAchievement } from "@/lib/db/achievements";
import { Achievement } from "@/lib/types/Achievement";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/middleware/admin";

export async function createAchievementAction(data: Omit<Achievement, "id">) {
  await requireAdmin();
  try {
    await createAchievement(data);
    revalidatePath("/admin/achievements");
    return { success: true };
  } catch (error) {
    console.error("Error creating achievement:", error);
    return { success: false, error: "Failed to create achievement" };
  }
}

export async function updateAchievementAction(id: string, data: Partial<Omit<Achievement, "id">>) {
  await requireAdmin();
  try {
    await updateAchievement(id, data);
    revalidatePath("/admin/achievements");
    return { success: true };
  } catch (error) {
    console.error("Error updating achievement:", error);
    return { success: false, error: "Failed to update achievement" };
  }
}

export async function deleteAchievementAction(id: string) {
  await requireAdmin();
  try {
    await deleteAchievement(id);
    revalidatePath("/admin/achievements");
    return { success: true };
  } catch (error) {
    console.error("Error deleting achievement:", error);
    return { success: false, error: "Failed to delete achievement" };
  }
}

