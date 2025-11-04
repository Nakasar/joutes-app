"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  addGameToUser,
  removeGameFromUser,
  addLairToUser,
  removeLairFromUser,
  updateUserDisplayName,
  getUserDiscriminator,
} from "@/lib/db/users";
import { updateDisplayNameSchema } from "@/lib/schemas/user.schema";
import { generateDiscriminator } from "@/lib/utils";

export async function addGameToUserList(gameId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const result = await addGameToUser(session.user.id, gameId);
    
    if (!result) {
      return { success: false, error: "Erreur lors de l'ajout du jeu" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'ajout du jeu:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function removeGameFromUserList(gameId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const result = await removeGameFromUser(session.user.id, gameId);
    
    if (!result) {
      return { success: false, error: "Erreur lors de la suppression du jeu" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression du jeu:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function addLairToUserList(lairId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const result = await addLairToUser(session.user.id, lairId);
    
    if (!result) {
      return { success: false, error: "Erreur lors de l'ajout du lieu" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'ajout du lieu:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function removeLairFromUserList(lairId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const result = await removeLairFromUser(session.user.id, lairId);
    
    if (!result) {
      return { success: false, error: "Erreur lors de la suppression du lieu" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression du lieu:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function updateUserDisplayNameAction(
  displayName: string
): Promise<{ success: boolean; error?: string; fullUsername?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Valider le nom d'utilisateur
    const validationResult = updateDisplayNameSchema.safeParse({ displayName });
    
    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues[0]?.message || "Nom d'utilisateur invalide";
      return { success: false, error: errorMessage };
    }

    // Vérifier si l'utilisateur a déjà un discriminateur
    let discriminator = await getUserDiscriminator(session.user.id);
    
    // Si pas de discriminateur, en générer un
    if (!discriminator) {
      discriminator = generateDiscriminator();
    }

    // Mettre à jour le nom d'utilisateur
    const result = await updateUserDisplayName(
      session.user.id,
      validationResult.data.displayName,
      discriminator
    );
    
    if (!result) {
      return { success: false, error: "Erreur lors de la mise à jour du nom d'utilisateur" };
    }

    return {
      success: true,
      fullUsername: `${validationResult.data.displayName}#${discriminator}`,
    };
  } catch (error) {
    console.error("Erreur lors de la mise à jour du nom d'utilisateur:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

