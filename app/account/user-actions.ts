"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { searchUsersByUsername, getUserByUsernameAndDiscriminator } from "@/lib/db/users";
import { User } from "@/lib/types/User";

export async function searchUsersAction(
  searchTerm: string
): Promise<{ success: boolean; error?: string; users?: User[] }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    if (!searchTerm || searchTerm.trim().length < 2) {
      return { success: true, users: [] };
    }

    const users = await searchUsersByUsername(searchTerm);

    return { success: true, users };
  } catch (error) {
    console.error("Erreur lors de la recherche d'utilisateurs:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function getUserByUsernameAction(
  displayName: string,
  discriminator: string
): Promise<{ success: boolean; error?: string; user?: User }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const user = await getUserByUsernameAndDiscriminator(displayName, discriminator);

    if (!user) {
      return { success: false, error: "Utilisateur non trouvé" };
    }

    return { success: true, user };
  } catch (error) {
    console.error("Erreur lors de la récupération de l'utilisateur:", error);
    return { success: false, error: "Erreur serveur" };
  }
}
