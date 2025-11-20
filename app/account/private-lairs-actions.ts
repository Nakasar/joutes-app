"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  createLair,
  updateLair,
  deleteLair,
  getLairById,
  regenerateInvitationCode,
  getLairByInvitationCode,
  addOwnerToLair,
} from "@/lib/db/lairs";
import { addLairToUser } from "@/lib/db/users";
import { lairSchema } from "@/lib/schemas/lair.schema";
import { generateInvitationCode, isValidInvitationCode } from "@/lib/utils/invitation-codes";

export async function createPrivateLair(
  name: string,
  address?: string,
  location?: { latitude: number; longitude: number }
): Promise<{ success: boolean; error?: string; lairId?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Créer le GeoJSON point si location est fourni
    const geoLocation = location
      ? {
          type: "Point" as const,
          coordinates: [location.longitude, location.latitude] as [number, number],
        }
      : undefined;

    // Générer un code d'invitation unique
    const invitationCode = generateInvitationCode();

    // Valider les données
    const validationResult = lairSchema.safeParse({
      name,
      address,
      location: geoLocation,
      isPrivate: true,
      invitationCode,
      eventsSourceUrls: [],
      games: [],
    });

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues[0]?.message || "Données invalides";
      return { success: false, error: errorMessage };
    }

    // Créer le lair
    const lair = await createLair({
      name: validationResult.data.name,
      address: validationResult.data.address,
      location: validationResult.data.location,
      isPrivate: true,
      invitationCode,
      eventsSourceUrls: [],
      games: [],
      owners: [session.user.id],
    });

    // Ajouter le lair à la liste des lairs suivis par l'utilisateur
    await addLairToUser(session.user.id, lair.id);

    revalidatePath("/account");
    revalidatePath("/lairs");

    return { success: true, lairId: lair.id };
  } catch (error) {
    console.error("Erreur lors de la création du lair privé:", error);
    return { success: false, error: "Erreur serveur" };
  }
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
): Promise<{ success: boolean; error?: string; invitationCode?: string }> {
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

    // Générer un nouveau code d'invitation
    const newCode = generateInvitationCode();
    const result = await regenerateInvitationCode(lairId, newCode);

    if (!result) {
      return { success: false, error: "Erreur lors de la régénération du code d'invitation" };
    }

    revalidatePath(`/lairs/${lairId}/manage`);

    return { success: true, invitationCode: newCode };
  } catch (error) {
    console.error("Erreur lors de la régénération du code d'invitation:", error);
    return { success: false, error: "Erreur serveur" };
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
