"use server";

import { requireAdmin } from "@/lib/middleware/admin";
import { deleteGameExport, getGameExportById } from "@/lib/db/game-exports";
import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";

export async function deleteGameExportAction(id: string) {
  try {
    await requireAdmin();

    const gameExport = await getGameExportById(id);
    if (!gameExport) {
      return { success: false, error: "Export non trouvé" };
    }

    await del(gameExport.url);
    await deleteGameExport(id);

    revalidatePath("/admin/exports");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression de l'export:", error);
    return { success: false, error: "Erreur lors de la suppression de l'export" };
  }
}
