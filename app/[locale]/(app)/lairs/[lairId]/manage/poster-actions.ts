"use server";

import { revalidatePath } from "next/cache";

import { requireAdminOrOwner } from "@/lib/middleware/admin.ts";
import { lairIdSchema } from "@/lib/schemas/lair.schema.ts";
import { lairPosterSettingsSchema, type LairPosterSettingsInput } from "@/lib/schemas/lair-poster.schema.ts";
import * as lairsDb from "@/lib/db/lairs.ts";
import { isLairPro } from "@/lib/lairs/pro.ts";
import { POSTER_STYLES } from "@/lib/posters/styles.ts";

export type LairPosterError = "INVALID" | "NOT_FOUND" | "PRO_REQUIRED" | "FAILED";

export type LairPosterResult = { success: true } | { success: false; error: LairPosterError };

/**
 * Enregistre les réglages de l'affiche du lieu.
 *
 * Le contrôle Pro est refait ici : un style réservé demandé par un lieu qui
 * n'est pas abonné est refusé en bloc, plutôt que silencieusement remplacé —
 * l'écran grise ces styles, et une demande qui passe outre est une erreur à
 * dire, pas à corriger en douce. Les deux interrupteurs, eux, sont ouverts à
 * tous.
 */
export async function updateLairPosterSettings(
  lairId: string,
  input: LairPosterSettingsInput,
): Promise<LairPosterResult> {
  try {
    await requireAdminOrOwner(lairId);
    const validatedId = lairIdSchema.parse(lairId);

    const parsed = lairPosterSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    const lair = await lairsDb.getLairById(validatedId);
    if (!lair) {
      return { success: false, error: "NOT_FOUND" };
    }

    const { style, showAttendance, gameLogos } = parsed.data;

    if (style && POSTER_STYLES[style].pro && !(await isLairPro(validatedId))) {
      return { success: false, error: "PRO_REQUIRED" };
    }

    await lairsDb.updateLair(validatedId, {
      options: {
        ...(lair.options ?? {}),
        poster: { style, showAttendance, gameLogos },
      },
    });

    revalidatePath(`/lairs/${validatedId}/manage`);
    revalidatePath(`/lairs/${validatedId}/affiche`);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'enregistrement des réglages de l'affiche:", error);
    return { success: false, error: "FAILED" };
  }
}
