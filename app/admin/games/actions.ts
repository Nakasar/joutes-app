"use server";

import { requireAdmin } from "@/lib/middleware/admin";
import { Game } from "@/lib/types/Game";
import { revalidatePath } from "next/cache";
import { gameSchema, gameIdSchema } from "@/lib/schemas/game.schema";
import { z } from "zod";
import * as gamesDb from "@/lib/db/games";

export async function getGames(): Promise<Game[]> {
  try {
    await requireAdmin();
    return await gamesDb.getAllGames();
  } catch (error) {
    throw new Error("Non autorisé");
  }
}

export async function createGame(data: {
  name: string;
  slug?: string;
  icon?: string;
  banner?: string;
  description: string;
  type: string;
}) {
  try {
    await requireAdmin();

    // Valider les données avec Zod
    const validatedData = gameSchema.parse(data);

    const newGame = await gamesDb.createGame(validatedData);
    revalidatePath("/admin/games");
    revalidatePath(`/games`);
    revalidatePath(`/games/${newGame.slug ?? newGame.id}`);
    
    return { success: true, game: newGame };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "Données invalides" 
      };
    }
    console.error("Erreur lors de la création du jeu:", error);
    return { success: false, error: "Erreur lors de la création du jeu" };
  }
}

export async function updateGame(
  id: string,
  data: {
    name: string;
    slug?: string;
    icon?: string;
    banner?: string;
    description: string;
    type: string;
  }
) {
  try {
    await requireAdmin();

    // Valider l'ID
    const validatedId = gameIdSchema.parse(id);
    
    // Valider les données avec Zod
    const validatedData = gameSchema.parse(data);

    const game = await gamesDb.getGameById(id);

    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    const updated = await gamesDb.updateGame(validatedId, validatedData);
    
    if (!updated) {
      return { success: false, error: "Jeu non trouvé" };
    }
    
    revalidatePath("/admin/games");
    revalidatePath("/admin/lairs");
    revalidatePath(`/games`);
    revalidatePath(`/games/${game.slug ?? game.id}`);
    revalidatePath(`/games/${validatedData.slug ?? game.id}`);
    
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "Données invalides" 
      };
    }
    console.error("Erreur lors de la modification du jeu:", error);
    return { success: false, error: "Erreur lors de la modification du jeu" };
  }
}

export async function deleteGame(id: string) {
  try {
    await requireAdmin();
    
    // Valider l'ID
    const validatedId = gameIdSchema.parse(id);

    const game = await gamesDb.getGameById(id);

    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }
    
    const deleted = await gamesDb.deleteGame(validatedId);
    
    if (!deleted) {
      return { success: false, error: "Jeu non trouvé" };
    }
    
    revalidatePath("/admin/games");
    revalidatePath("/admin/lairs");
    revalidatePath(`/games`);
    revalidatePath(`/games/${game.slug ?? game.id}`);
    
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "ID invalide" 
      };
    }
    console.error("Erreur lors de la suppression du jeu:", error);
    return { success: false, error: "Erreur lors de la suppression du jeu" };
  }
}

export async function updateGameFeaturedLairs(
  id: string,
  featuredLairs: string[]
) {
  try {
    await requireAdmin();

    // Valider l'ID
    const validatedId = gameIdSchema.parse(id);

    const game = await gamesDb.getGameById(id);

    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    // Valider les IDs des lairs
    const validatedLairIds = z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).parse(featuredLairs);

    const updated = await gamesDb.updateGame(validatedId, { featuredLairs: validatedLairIds });

    if (!updated) {
      return { success: false, error: "Jeu non trouvé" };
    }

    revalidatePath("/admin/games");
    revalidatePath(`/games/${game.slug ?? game.id}`);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || "Données invalides"
      };
    }
    console.error("Erreur lors de la mise à jour des lieux mis en avant:", error);
    return { success: false, error: "Erreur lors de la mise à jour des lieux mis en avant" };
  }
}
