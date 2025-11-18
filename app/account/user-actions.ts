"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { 
  searchUsersByUsername, 
  getUserByUsernameAndDiscriminator, 
  updateUserProfileVisibility, 
  getUserByTagOrId,
  updateUserProfileInfo,
  updateUserProfileImage
} from "@/lib/db/users";
import { User } from "@/lib/types/User";
import { 
  updateProfileVisibilitySchema, 
  updateProfileInfoSchema,
  updateProfileImageSchema
} from "@/lib/schemas/user.schema";

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

/**
 * Met à jour la visibilité du profil de l'utilisateur connecté
 */
export async function updateProfileVisibilityAction(
  isPublicProfile: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Validation avec Zod
    const validation = updateProfileVisibilitySchema.safeParse({ isPublicProfile });
    if (!validation.success) {
      return { success: false, error: "Données invalides" };
    }

    const updated = await updateUserProfileVisibility(session.user.id, isPublicProfile);

    if (!updated) {
      return { success: false, error: "Erreur lors de la mise à jour" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la visibilité du profil:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

/**
 * Récupère le profil public d'un utilisateur (accessible sans authentification)
 */
export async function getPublicUserProfileAction(
  userTagOrId: string
): Promise<{ success: boolean; error?: string; user?: User; isPublic?: boolean }> {
  try {
    let formatted = userTagOrId.trim();
    if (!userTagOrId.includes("#") && isNaN(+userTagOrId.substring(-4))) {
      const lastFour = userTagOrId.slice(-4);
      const namePart = userTagOrId.slice(0, -4);
      formatted = `${namePart}#${lastFour}`;
    }
    console.log(formatted);
    const user = await getUserByTagOrId(formatted);

    if (!user) {
      return { success: false, error: "Utilisateur non trouvé" };
    }

    // Retourner l'utilisateur avec indication de visibilité
    return { 
      success: true, 
      user,
      isPublic: user.isPublicProfile || false
    };
  } catch (error) {
    console.error("Erreur lors de la récupération du profil public:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

/**
 * Met à jour les informations publiques du profil de l'utilisateur connecté
 */
export async function updateProfileInfoAction(
  data: {
    description?: string;
    website?: string;
    socialLinks?: string[];
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Validation avec Zod
    const validation = updateProfileInfoSchema.safeParse(data);
    if (!validation.success) {
      return { 
        success: false, 
        error: validation.error.issues[0]?.message || "Données invalides" 
      };
    }

    const updated = await updateUserProfileInfo(session.user.id, validation.data);

    if (!updated) {
      return { success: false, error: "Erreur lors de la mise à jour" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour des informations du profil:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

/**
 * Met à jour l'image de profil de l'utilisateur connecté
 */
export async function updateProfileImageAction(
  profileImage: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Validation avec Zod
    const validation = updateProfileImageSchema.safeParse({ profileImage });
    if (!validation.success) {
      return { 
        success: false, 
        error: validation.error.issues[0]?.message || "URL invalide" 
      };
    }

    const updated = await updateUserProfileImage(session.user.id, profileImage);

    if (!updated) {
      return { success: false, error: "Erreur lors de la mise à jour" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'image de profil:", error);
    return { success: false, error: "Erreur serveur" };
  }
}
