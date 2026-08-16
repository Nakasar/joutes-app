"use server";

import { requireAdminOrOwner } from "@/lib/middleware/admin";
import { revalidatePath } from "next/cache";
import { lairSchema, lairIdSchema } from "@/lib/schemas/lair.schema";
import { z } from "zod";
import * as lairsDb from "@/lib/db/lairs";
import * as usersDb from "@/lib/db/users";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { attachLairSeat, detachLairSeat, getSubscriptionByUserId } from "@/lib/db/subscriptions";
import { canAttachPro } from "@/lib/subscriptions/seats";
import { seatsFor } from "@/lib/subscriptions/entitlements";

const emailSchema = z.string().email("Email invalide");

export async function updateLairDetails(
  lairId: string,
  data: { 
    name: string; 
    banner?: string; 
    games: string[];
    location?: { type: "Point"; coordinates: [number, number] };
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

/**
 * Rattache ce lieu à l'abonnement Pro de l'acteur.
 *
 * Deux autorisations se cumulent, et elles ne disent pas la même chose :
 * `requireAdminOrOwner` dit « vous avez le droit de toucher à ce lieu », et le
 * plan Pro dit « vous avez de quoi le parrainer ». Un propriétaire non abonné ne
 * peut pas rattacher, un abonné qui ne possède pas le lieu non plus.
 *
 * Il doit être propriétaire **au moment du rattachement**, pas le rester : c'est
 * exactement ce qui permet au lieu de garder ses droits quand un gérant s'en va.
 */
export async function attachProToLair(lairId: string) {
  const validId = lairIdSchema.parse(lairId);
  await requireAdminOrOwner(validId);

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return { success: false as const, error: "not-authenticated" };
  }

  const lair = await lairsDb.getLairById(validId);

  if (!lair) {
    return { success: false as const, error: "lair-not-found" };
  }

  const subscription = await getSubscriptionByUserId(session.user.id);
  const plans = subscription?.plans ?? [];

  // La règle est calculée à part, et testée : l'action ne fait que la porter.
  const check = canAttachPro({ plans, seats: subscription?.seats ?? [], lair });

  if (!check.ok) {
    return { success: false as const, error: check.reason };
  }

  const attached = await attachLairSeat({
    userId: session.user.id,
    lairId: validId,
    maxSeats: seatsFor(plans),
    plan: "pro",
  });

  if (!attached) {
    // La borne et l'unicité sont tenues par la base : un refus ici veut dire
    // qu'une autre requête est passée avant, pas que la règle a changé.
    return { success: false as const, error: "seats-full" };
  }

  revalidatePath(`/lairs/${validId}`);
  revalidatePath(`/lairs/${validId}/manage`);
  revalidatePath("/account/subscription");

  return { success: true as const };
}

/**
 * Détache ce lieu.
 *
 * Ouvert à **tout propriétaire actuel**, et pas au seul compte qui l'a
 * rattaché : sinon un gérant parti garderait le lieu en otage, et le siège avec.
 */
export async function detachProFromLair(lairId: string) {
  const validId = lairIdSchema.parse(lairId);
  await requireAdminOrOwner(validId);

  const detached = await detachLairSeat(validId);

  revalidatePath(`/lairs/${validId}`);
  revalidatePath(`/lairs/${validId}/manage`);
  revalidatePath("/account/subscription");

  return detached ? { success: true as const } : { success: false as const, error: "not-attached" };
}
