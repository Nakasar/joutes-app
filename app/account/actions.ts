"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  addGameToUser,
  removeGameFromUser,
  addLairToUser,
  removeLairFromUser,
} from "@/lib/db/users";

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
