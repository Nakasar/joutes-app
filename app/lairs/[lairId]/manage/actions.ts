"use server";

import { requireAdminOrOwner } from "@/lib/middleware/admin";
import { revalidatePath } from "next/cache";
import { lairSchema, lairIdSchema } from "@/lib/schemas/lair.schema";
import { z } from "zod";
import * as lairsDb from "@/lib/db/lairs";
import * as usersDb from "@/lib/db/users";

const emailSchema = z.string().email("Email invalide");

export async function updateLairDetails(
  lairId: string,
  data: { 
    name: string; 
    banner?: string; 
    games: string[];
    coordinates?: { latitude: number; longitude: number };
    address?: string;
    website?: string;
  }
) {
  try {
    await requireAdminOrOwner(lairId);

    // Valider l'ID
    const validatedId = lairIdSchema.parse(lairId);

    // Valider les données avec Zod
    const validatedData = lairSchema.omit({ eventsSourceUrls: true }).parse(data);

    const updatedLair = await lairsDb.updateLair(validatedId, validatedData);

    if (!updatedLair) {
      return { success: false, error: "Lieu non trouvé" };
    }

    revalidatePath(`/lairs`);
    revalidatePath(`/lairs/${lairId}`);
    revalidatePath(`/lairs/${lairId}/manage`);

    return { success: true, lair: updatedLair };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || "Données invalides",
      };
    }
    console.error("Erreur lors de la mise à jour du lieu:", error);
    return { success: false, error: "Erreur lors de la mise à jour du lieu" };
  }
}

export async function addOwner(lairId: string, email: string) {
  try {
    await requireAdminOrOwner(lairId);

    // Valider l'ID
    const validatedId = lairIdSchema.parse(lairId);

    // Valider l'email
    const validatedEmail = emailSchema.parse(email);

    // Chercher l'utilisateur par email
    const user = await usersDb.getUserByEmail(validatedEmail);

    if (!user) {
      return { success: false, error: "Utilisateur non trouvé avec cet email" };
    }

    // Ajouter l'owner au lair
    await lairsDb.addOwnerToLair(validatedId, user.id);

    revalidatePath(`/lairs/${lairId}/manage`);

    return { success: true, user };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || "Données invalides",
      };
    }
    console.error("Erreur lors de l'ajout de l'owner:", error);
    return { success: false, error: "Erreur lors de l'ajout de l'owner" };
  }
}

export async function removeOwner(lairId: string, userId: string) {
  try {
    await requireAdminOrOwner(lairId);

    // Valider l'ID
    const validatedLairId = lairIdSchema.parse(lairId);
    const validatedUserId = lairIdSchema.parse(userId);

    // Retirer l'owner du lair
    await lairsDb.removeOwnerFromLair(validatedLairId, validatedUserId);

    revalidatePath(`/lairs/${lairId}/manage`);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || "ID invalide",
      };
    }
    console.error("Erreur lors de la suppression de l'owner:", error);
    return { success: false, error: "Erreur lors de la suppression de l'owner" };
  }
}
