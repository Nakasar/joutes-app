"use server";

import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { searchUsersByUsername, getUserByUsernameAndDiscriminator } from "@/lib/db/users.ts";
import { User } from "@/lib/types/User.ts";

/**
 * Ce qui reste ici : deux recherches de compte, derrière une session.
 *
 * La visibilité, la description, l'avatar et la lecture d'un profil public sont
 * parties — la vitrine les écrit par `account/showcase-actions.ts`, l'avatar
 * passe par `/api/users/me/upload`, et la page de profil lit par
 * `users/[userTagOrId]/profile-data.ts`. Deux de ces actions avaient de vrais
 * défauts que le déplacement corrige : `getPublicUserProfileAction` renvoyait le
 * document `user` entier — e-mail, identifiant Discord, amis, position exacte —
 * à une page publique, et son découpage de tag concaténé gardait sur
 * `substring(-4)`, qui rend la chaîne entière ; `updateProfileImageAction`
 * déposait sous le seul nom du fichier, si bien que deux comptes déposant
 * chacun un `avatar.png` entraient en collision.
 */

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
