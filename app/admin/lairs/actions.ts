"use server";

import { requireAdmin } from "@/lib/middleware/admin";
import { Lair } from "@/lib/types/Lair";
import { revalidatePath } from "next/cache";
import { lairSchema, lairIdSchema } from "@/lib/schemas/lair.schema";
import { z } from "zod";
import * as lairsDb from "@/lib/db/lairs";

export async function getLairs(): Promise<Lair[]> {
  try {
    await requireAdmin();
    return await lairsDb.getAllLairs();
  } catch (error) {
    throw new Error("Non autorisé");
  }
}

export async function createLair(data: { name: string; banner: string; games: string[] }) {
  try {
    await requireAdmin();
    
    // Valider les données avec Zod
    const validatedData = lairSchema.parse(data);
    
    const newLair = await lairsDb.createLair({
      ...validatedData,
      owners: [],
    });

    revalidatePath("/admin/lairs");
    
    return { success: true, lair: newLair };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "Données invalides" 
      };
    }
    console.error("Erreur lors de la création du lieu:", error);
    return { success: false, error: "Erreur lors de la création du lieu" };
  }
}

export async function deleteLair(id: string) {
  try {
    await requireAdmin();
    
    // Valider l'ID
    const validatedId = lairIdSchema.parse(id);
    
    const deleted = await lairsDb.deleteLair(validatedId);
    
    if (!deleted) {
      return { success: false, error: "Lieu non trouvé" };
    }
    
    revalidatePath("/admin/lairs");
    
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "ID invalide" 
      };
    }
    console.error("Erreur lors de la suppression du lieu:", error);
    return { success: false, error: "Erreur lors de la suppression du lieu" };
  }
}
