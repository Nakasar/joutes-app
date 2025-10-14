"use server";

import { requireAdmin } from "@/lib/middleware/admin";
import { Lair } from "@/lib/types/Lair";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { lairSchema, lairIdSchema } from "@/lib/schemas/lair.schema";
import { z } from "zod";

export async function getLairs(): Promise<Lair[]> {
  try {
    await requireAdmin();
    return storage.lairs;
  } catch (error) {
    throw new Error("Non autorisé");
  }
}

export async function createLair(data: { name: string; banner: string; games: string[] }) {
  try {
    await requireAdmin();
    
    // Valider les données avec Zod
    const validatedData = lairSchema.parse(data);
    
    const newLair: Lair = {
      id: crypto.randomUUID(),
      ...validatedData,
      owners: [],
    };

    storage.lairs.push(newLair);
    revalidatePath("/admin/lairs");
    
    return { success: true, lair: newLair };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "Données invalides" 
      };
    }
    return { success: false, error: "Non autorisé" };
  }
}

export async function deleteLair(id: string) {
  try {
    await requireAdmin();
    
    // Valider l'ID
    const validatedId = lairIdSchema.parse(id);
    
    const initialLength = storage.lairs.length;
    storage.lairs = storage.lairs.filter((lair) => lair.id !== validatedId);
    
    if (storage.lairs.length === initialLength) {
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
    return { success: false, error: "Non autorisé" };
  }
}
