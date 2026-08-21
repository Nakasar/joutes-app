"use server";

import { requireAdminOrOwner } from "@/lib/middleware/admin.ts";
import { revalidatePath } from "next/cache";
import { lairDetailsSchema, lairIdSchema } from "@/lib/schemas/lair.schema.ts";
import { z } from "zod";
import * as lairsDb from "@/lib/db/lairs.ts";
import * as usersDb from "@/lib/db/users.ts";
import { headers } from "next/headers";
import { auth } from "@/lib/auth.ts";
import { attachLairSeat, detachLairSeat, getSubscriptionByUserId } from "@/lib/db/subscriptions.ts";
import { canAttachPro } from "@/lib/subscriptions/seats.ts";
import { plansFromSubscription } from "@/lib/subscriptions/access.ts";
import { seatsFor } from "@/lib/subscriptions/entitlements.ts";

const emailSchema = z.string().email("Email invalide");

/**
 * Les échecs de cet écran, en codes plutôt qu'en phrases.
 *
 * Une action serveur ne sait pas dans quelle langue la page est rendue ; le
 * composant qui l'appelle, si. Ces actions renvoyaient des phrases françaises
 * que le client affichait telles quelles — donc du français sur les trois
 * autres langues du catalogue.
 *
 * `field` accompagne `INVALID` quand la validation désigne un champ : le
 * message reste traduit côté client, mais il peut nommer ce qui cloche plutôt
 * que de s'en tenir à « certains champs sont invalides ».
 */
export type LairManageError = "NOT_FOUND" | "USER_NOT_FOUND" | "INVALID" | "FAILED";

export type LairManageFailure = {
  success: false;
  error: LairManageError;
  /** Le premier segment du chemin Zod fautif, quand il y en a un. */
  field?: string;
};

/** Traduit un échec de validation en code, en gardant le champ visé. */
function invalidFrom(error: z.ZodError): LairManageFailure {
  const path = error.issues[0]?.path?.[0];

  return {
    success: false,
    error: "INVALID",
    field: typeof path === "string" ? path : undefined,
  };
}

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

    // `lairDetailsSchema` et non `lairSchema.omit(...)` : voir le schéma, cet
    // `omit` levait sur un objet à refinements et l'onglet n'enregistrait rien.
    const validatedData = lairDetailsSchema.parse(data);

    const updatedLair = await lairsDb.updateLair(validatedId, validatedData);

    if (!updatedLair) {
      return { success: false as const, error: "NOT_FOUND" as const };
    }

    revalidatePath(`/lairs`);
    revalidatePath(`/lairs/${lairId}`);
    revalidatePath(`/lairs/${lairId}/manage`);

    return { success: true as const, lair: updatedLair };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return invalidFrom(error);
    }
    console.error("Erreur lors de la mise à jour du lieu:", error);
    return { success: false as const, error: "FAILED" as const };
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
      return { success: false as const, error: "USER_NOT_FOUND" as const };
    }

    // Ajouter l'owner au lair
    await lairsDb.addOwnerToLair(validatedId, user.id);

    revalidatePath(`/lairs/${lairId}/manage`);

    return { success: true as const, user };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return invalidFrom(error);
    }
    console.error("Erreur lors de l'ajout de l'owner:", error);
    return { success: false as const, error: "FAILED" as const };
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

    return { success: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return invalidFrom(error);
    }
    console.error("Erreur lors de la suppression de l'owner:", error);
    return { success: false as const, error: "FAILED" as const };
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
  // Composés, jamais bruts : un palier offert par l'équipe vaut un palier payé,
  // et lire `subscription.plans` refusait le rattachement à qui l'avait reçu.
  const plans = plansFromSubscription(subscription);

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
