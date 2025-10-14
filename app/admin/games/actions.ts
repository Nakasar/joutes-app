"use server";

import { requireAdmin } from "@/lib/middleware/admin";
import { Game } from "@/lib/types/Game";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { gameSchema, gameIdSchema } from "@/lib/schemas/game.schema";
import { z } from "zod";

export async function getGames(): Promise<Game[]> {
  try {
    await requireAdmin();
    return storage.games;
  } catch (error) {
    throw new Error("Non autorisé");
  }
}

export async function createGame(formData: FormData) {
  try {
    await requireAdmin();
    
    // Extraire les données du FormData
    const data = {
      name: formData.get("name") as string,
      icon: formData.get("icon") as string,
      banner: formData.get("banner") as string,
      description: formData.get("description") as string,
      type: formData.get("type") as string,
    };

    // Valider les données avec Zod
    const validatedData = gameSchema.parse(data);

    const newGame: Game = {
      id: crypto.randomUUID(),
      ...validatedData,
    };

    storage.games.push(newGame);
    revalidatePath("/admin/games");
    
    return { success: true, game: newGame };
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

export async function deleteGame(id: string) {
  try {
    await requireAdmin();
    
    // Valider l'ID
    const validatedId = gameIdSchema.parse(id);
    
    const initialLength = storage.games.length;
    storage.games = storage.games.filter((game) => game.id !== validatedId);
    
    if (storage.games.length === initialLength) {
      return { success: false, error: "Jeu non trouvé" };
    }
    
    revalidatePath("/admin/games");
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
