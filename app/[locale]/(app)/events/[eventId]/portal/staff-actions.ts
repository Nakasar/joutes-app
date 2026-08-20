"use server";

import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getEventById, addStaffToEvent, removeStaffFromEvent, updateStaffRole } from "@/lib/db/events.ts";
import { getUserByEmail, getUserByUsernameAndDiscriminator, getUserById } from "@/lib/db/users.ts";
import { canAddStaffMember, canManageStaff } from "@/lib/events/rules.ts";

/**
 * Ajouter un membre au staff de l'événement
 * Seul le créateur de l'événement peut ajouter du staff
 */
export async function addStaffMemberAction(
  eventId: string,
  userIdentifier: string,
  role: "organizer" | "judge"
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const event = await getEventById(eventId);
    if (!event) {
      return { success: false, error: "Événement introuvable" };
    }

    // Seuls les organisateurs peuvent gérer le staff
    const allowed = canManageStaff(event, session.user.id);
    if (!allowed.ok) {
      return { success: false, error: allowed.error };
    }

    // Chercher l'utilisateur par email ou par tag (displayName#discriminator)
    let user = null;
    const trimmedIdentifier = userIdentifier.trim();

    if (trimmedIdentifier.includes("@")) {
      // Recherche par email
      user = await getUserByEmail(trimmedIdentifier);
    } else if (trimmedIdentifier.includes("#")) {
      // Recherche par displayName#discriminator
      const parts = trimmedIdentifier.split("#");
      if (parts.length === 2) {
        const [displayName, discriminator] = parts;
        user = await getUserByUsernameAndDiscriminator(displayName, discriminator);
      }
    }

    if (!user) {
      return { success: false, error: "Utilisateur introuvable. Vérifiez le tag (ex: Pseudo#1234) ou l'email." };
    }

    // Ni le créateur, ni quelqu'un déjà dans l'équipe
    const addable = canAddStaffMember(event, user.id);
    if (!addable.ok) {
      return { success: false, error: addable.error };
    }

    const result = await addStaffToEvent(eventId, user.id, role);

    if (!result) {
      return { success: false, error: "Erreur lors de l'ajout du membre" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/portal`);

    return {
      success: true,
      data: {
        userId: user.id,
        displayName: user.displayName,
        discriminator: user.discriminator,
        email: user.email,
        role,
      },
    };
  } catch (error) {
    console.error("Erreur lors de l'ajout du staff:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

/**
 * Retirer un membre du staff
 */
export async function removeStaffMemberAction(eventId: string, userId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const event = await getEventById(eventId);
    if (!event) {
      return { success: false, error: "Événement introuvable" };
    }

    const allowed = canManageStaff(event, session.user.id);
    if (!allowed.ok) {
      return { success: false, error: allowed.error };
    }

    const result = await removeStaffFromEvent(eventId, userId);

    if (!result) {
      return { success: false, error: "Erreur lors de la suppression du membre" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/portal`);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression du staff:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

/**
 * Modifier le rôle d'un membre du staff
 */
export async function updateStaffRoleAction(
  eventId: string,
  userId: string,
  role: "organizer" | "judge"
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const event = await getEventById(eventId);
    if (!event) {
      return { success: false, error: "Événement introuvable" };
    }

    const allowed = canManageStaff(event, session.user.id);
    if (!allowed.ok) {
      return { success: false, error: allowed.error };
    }

    const result = await updateStaffRole(eventId, userId, role);

    if (!result) {
      return { success: false, error: "Erreur lors de la modification du rôle" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/portal`);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la modification du rôle:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

/**
 * Récupérer les membres du staff avec leurs infos utilisateur
 */
export async function getStaffMembersAction(eventId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const event = await getEventById(eventId);
    if (!event) {
      return { success: false, error: "Événement introuvable" };
    }

    // Le créateur et les organizers peuvent voir le staff
    const isCreator = event.creatorId === session.user.id;
    const isOrganizer = event.staff?.some(
      (s) => s.userId === session.user.id && s.role === "organizer"
    );

    if (!isCreator && !isOrganizer) {
      return { success: false, error: "Accès refusé" };
    }

    const staffMembers = event.staff || [];

    // Enrichir avec les infos utilisateur
    const enrichedStaff = await Promise.all(
      staffMembers.map(async (member) => {
        const user = await getUserById(member.userId);
        return {
          userId: member.userId,
          role: member.role,
          displayName: user?.displayName || "Utilisateur inconnu",
          discriminator: user?.discriminator || "0000",
          email: user?.email || "",
          profileImage: user?.profileImage,
        };
      })
    );

    return { success: true, data: enrichedStaff };
  } catch (error) {
    console.error("Erreur lors de la récupération du staff:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}
