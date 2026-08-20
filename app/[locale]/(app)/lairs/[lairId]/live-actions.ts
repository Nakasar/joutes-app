"use server";

import { revalidatePath } from "next/cache";

import { requireAdminOrOwner } from "@/lib/middleware/admin.ts";
import { lairIdSchema } from "@/lib/schemas/lair.schema.ts";
import * as lairsDb from "@/lib/db/lairs.ts";
import { isSupportedLiveUrl } from "@/lib/lairs/live.ts";

type LiveActionResult = { success: true } | { success: false; error: string };

/**
 * Ouvre — ou remplace — le direct du lieu.
 *
 * `startedAt` n'est réécrit que lorsque l'URL change : corriger la faute de
 * frappe d'un lien Twitch ne doit pas ramener « depuis 42 min » à zéro alors
 * que le direct tourne depuis une heure.
 */
export async function setLairLiveStream(lairId: string, url: string): Promise<LiveActionResult> {
  try {
    await requireAdminOrOwner(lairId);
    const validatedId = lairIdSchema.parse(lairId);

    const value = url.trim();
    if (!isSupportedLiveUrl(value)) {
      return { success: false, error: "URL de direct invalide" };
    }

    const lair = await lairsDb.getLairById(validatedId);
    if (!lair) {
      return { success: false, error: "Lieu non trouvé" };
    }

    const current = lair.options?.live ?? null;

    await lairsDb.updateLair(validatedId, {
      options: {
        ...lair.options,
        live: {
          url: value,
          title: current?.url === value ? current.title : undefined,
          startedAt: current?.url === value ? current.startedAt : new Date().toISOString(),
        },
      },
    });

    revalidatePath(`/lairs/${validatedId}`);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour du direct du lieu:", error);
    return { success: false, error: "Erreur lors de la mise à jour du direct" };
  }
}

/** Coupe le direct : le cadre disparaît de la page pour tout le monde. */
export async function stopLairLiveStream(lairId: string): Promise<LiveActionResult> {
  try {
    await requireAdminOrOwner(lairId);
    const validatedId = lairIdSchema.parse(lairId);

    const lair = await lairsDb.getLairById(validatedId);
    if (!lair) {
      return { success: false, error: "Lieu non trouvé" };
    }

    await lairsDb.updateLair(validatedId, {
      options: { ...lair.options, live: null },
    });

    revalidatePath(`/lairs/${validatedId}`);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'arrêt du direct du lieu:", error);
    return { success: false, error: "Erreur lors de l'arrêt du direct" };
  }
}
