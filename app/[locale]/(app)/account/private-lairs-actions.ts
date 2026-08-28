"use server";

import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  updateLair,
  deleteLair,
  getLairById,
  regenerateInvitationCode,
  getLairByInvitationCode,
  addOwnerToLair,
} from "@/lib/db/lairs.ts";
import { addLairToUser, removeLairFromUser } from "@/lib/db/users.ts";
import { createLairForUser, type CreateLairError } from "@/lib/lairs/create.ts";

/**
 * Les échecs des deux actions que la gestion d'un lieu appelle, en codes.
 *
 * Une action serveur ne sait pas dans quelle langue la page est rendue. Ces
 * deux-là renvoyaient des phrases françaises, et l'écran qui les relayait
 * n'avait d'autre choix que de les afficher telles quelles — ou, en les
 * remplaçant par un message générique, de dire « réessayez » à propos d'un
 * refus qui ne passera jamais.
 *
 * Les autres actions de ce fichier ne servent que les écrans `/account` et
 * gardent leurs phrases : les convertir dépasserait ce qui est traité ici.
 */
export type PrivateLairError =
  | "NOT_AUTHENTICATED"
  | "LAIR_NOT_FOUND"
  | "NOT_OWNER"
  | "NOT_PRIVATE"
  | "IS_OWNER"
  | "FAILED";
import { generateInvitationCode, isValidInvitationCode } from "@/lib/utils/invitation-codes.ts";

/**
 * Crée un lieu privé pour le compte connecté.
 *
 * Ne décide plus rien elle-même : la création — validation, code d'invitation,
 * abonnement du créateur à son propre lieu — vit dans `createLairForUser`,
 * partagée avec l'annuaire, qui ouvre aussi les lieux publics. Cet écran-ci
 * n'étant pas traduit, les codes de refus sont remis en phrases françaises,
 * exactement celles qu'il affichait auparavant.
 */
const CREATE_ERRORS: Record<CreateLairError | "DUPLICATE", string> = {
  NAME_REQUIRED: "Le nom du lieu est requis",
  ADDRESS_REQUIRED: "L'adresse est requise",
  LOCATION_REQUIRED: "La localisation est requise",
  WEBSITE_INVALID: "L'URL du site web doit être valide",
  INVALID: "Données invalides",
  TOO_MANY: "Vous avez atteint le nombre maximal de lieux publics",
  DUPLICATE: "Un lieu portant ce nom existe déjà à cet endroit",
  FAILED: "Erreur serveur",
};

export async function createPrivateLair(
  name: string,
  address?: string,
  location?: { latitude: number; longitude: number }
): Promise<{ success: boolean; error?: string; lairId?: string }> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return { success: false, error: "Non authentifié" };
  }

  const result = await createLairForUser(session.user.id, {
    name,
    visibility: "private",
    address,
    location,
  });

  if (!result.success) {
    return { success: false, error: CREATE_ERRORS[result.error] };
  }

  revalidatePath("/account");
  revalidatePath("/lairs");

  return { success: true, lairId: result.lair.id };
}

export async function updatePrivateLairAction(
  lairId: string,
  name: string,
  address?: string,
  location?: { latitude: number; longitude: number }
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que le lair existe et que l'utilisateur en est propriétaire
    const lair = await getLairById(lairId);
    if (!lair) {
      return { success: false, error: "Lair introuvable" };
    }

    if (!lair.owners.includes(session.user.id)) {
      return { success: false, error: "Vous n'êtes pas propriétaire de ce lieu" };
    }

    if (!lair.isPrivate) {
      return { success: false, error: "Ce lieu n'est pas privé" };
    }

    // Créer le GeoJSON point si location est fourni
    const geoLocation = location
      ? {
          type: "Point" as const,
          coordinates: [location.longitude, location.latitude] as [number, number],
        }
      : lair.location;

    // Mettre à jour le lair
    const result = await updateLair(lairId, {
      name,
      address,
      location: geoLocation,
    });

    if (!result) {
      return { success: false, error: "Erreur lors de la mise à jour du lair" };
    }

    revalidatePath("/account");
    revalidatePath(`/lairs/${lairId}`);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour du lair privé:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function deletePrivateLairAction(lairId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que le lair existe et que l'utilisateur en est propriétaire
    const lair = await getLairById(lairId);
    if (!lair) {
      return { success: false, error: "Lair introuvable" };
    }

    if (!lair.owners.includes(session.user.id)) {
      return { success: false, error: "Vous n'êtes pas propriétaire de ce lieu" };
    }

    if (!lair.isPrivate) {
      return { success: false, error: "Ce lieu n'est pas privé" };
    }

    // Supprimer le lair
    const result = await deleteLair(lairId);

    if (!result) {
      return { success: false, error: "Erreur lors de la suppression du lair" };
    }

    revalidatePath("/account");
    revalidatePath("/lairs");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression du lair privé:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function regenerateInvitationCodeAction(
  lairId: string
): Promise<{ success: true; invitationCode: string } | { success: false; error: PrivateLairError }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "NOT_AUTHENTICATED" };
    }

    // Vérifier que le lair existe et que l'utilisateur en est propriétaire
    const lair = await getLairById(lairId);
    if (!lair) {
      return { success: false, error: "LAIR_NOT_FOUND" };
    }

    if (!lair.owners.includes(session.user.id)) {
      return { success: false, error: "NOT_OWNER" };
    }

    if (!lair.isPrivate) {
      return { success: false, error: "NOT_PRIVATE" };
    }

    // Générer un nouveau code d'invitation
    const newCode = generateInvitationCode();
    const result = await regenerateInvitationCode(lairId, newCode);

    if (!result) {
      return { success: false, error: "FAILED" };
    }

    revalidatePath(`/lairs/${lairId}/manage`);

    return { success: true, invitationCode: newCode };
  } catch (error) {
    console.error("Erreur lors de la régénération du code d'invitation:", error);
    return { success: false, error: "FAILED" };
  }
}

export async function acceptInvitationAction(
  invitationCode: string
): Promise<{ success: boolean; error?: string; lairId?: string; lairName?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Valider le format du code
    if (!isValidInvitationCode(invitationCode)) {
      return { success: false, error: "Code d'invitation invalide" };
    }

    // Récupérer le lair par code d'invitation
    const lair = await getLairByInvitationCode(invitationCode);

    if (!lair) {
      return { success: false, error: "Lair introuvable avec ce code d'invitation" };
    }

    // Ajouter le lair à la liste des lairs suivis par l'utilisateur
    await addLairToUser(session.user.id, lair.id);

    revalidatePath("/account");
    revalidatePath("/lairs");

    return {
      success: true,
      lairId: lair.id,
      lairName: lair.name,
    };
  } catch (error) {
    console.error("Erreur lors de l'acceptation de l'invitation:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function removeFollowerFromPrivateLair(
  lairId: string,
  userId: string
): Promise<{ success: true } | { success: false; error: PrivateLairError }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "NOT_AUTHENTICATED" };
    }

    // Vérifier que le lair existe et que l'utilisateur en est propriétaire
    const lair = await getLairById(lairId);
    if (!lair) {
      return { success: false, error: "LAIR_NOT_FOUND" };
    }

    if (!lair.owners.includes(session.user.id)) {
      return { success: false, error: "NOT_OWNER" };
    }

    if (!lair.isPrivate) {
      return { success: false, error: "NOT_PRIVATE" };
    }

    // Empêcher de retirer un propriétaire
    if (lair.owners.includes(userId)) {
      return { success: false, error: "IS_OWNER" };
    }

    // Retirer le lair de la liste des lairs suivis par l'utilisateur
    const result = await removeLairFromUser(userId, lairId);

    if (!result) {
      return { success: false, error: "FAILED" };
    }

    revalidatePath(`/lairs/${lairId}/manage`);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors du retrait de l'utilisateur:", error);
    return { success: false as const, error: "FAILED" as const };
  }
}
