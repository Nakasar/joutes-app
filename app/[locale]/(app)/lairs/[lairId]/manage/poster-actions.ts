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
 * Le contrôle Pro est refait ici : un style réservé — comme la signature du
 * pied d'affiche et l'appel à l'action — demandé par un lieu qui n'est pas
 * abonné est refusé en bloc, plutôt que silencieusement remplacé : l'écran
 * grise ces réglages, et une demande qui passe outre est une erreur à dire,
 * pas à corriger en douce. Les deux interrupteurs, eux, sont ouverts à tous.
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

    const { style, showAttendance, gameLogos, branding, cta } = parsed.data;

    // Une personnalisation vide n'est pas une personnalisation : un lieu qui
    // n'est plus Pro doit pouvoir effacer ce qu'il avait posé, et enregistrer
    // le reste de son affiche sans se heurter au verrou.
    const wantsCustomFooter = [branding, cta].some(
      (block) => block && Object.values(block).some((value) => value !== undefined),
    );

    if ((style && POSTER_STYLES[style].pro) || wantsCustomFooter) {
      if (!(await isLairPro(validatedId))) {
        return { success: false, error: "PRO_REQUIRED" };
      }
    }

    // Seuls les champs envoyés changent : le schéma les admet tous facultatifs,
    // et un appel partiel ne doit pas effacer le reste — même mécanique que la
    // personnalisation de la vitrine.
    const previous = lair.options?.poster ?? {};
    const poster = {
      ...previous,
      ...(style !== undefined ? { style } : {}),
      ...(showAttendance !== undefined ? { showAttendance } : {}),
      ...(gameLogos !== undefined ? { gameLogos } : {}),
      // La signature et l'appel à l'action, eux, se remplacent en bloc : le
      // formulaire les envoie entiers, et un champ absent y veut dire vidé.
      ...(branding !== undefined ? { branding } : {}),
      ...(cta !== undefined ? { cta } : {}),
    };

    await lairsDb.updateLair(validatedId, {
      options: { ...(lair.options ?? {}), poster },
    });

    revalidatePath(`/lairs/${validatedId}/manage`);
    revalidatePath(`/lairs/${validatedId}/affiche`);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'enregistrement des réglages de l'affiche:", error);
    return { success: false, error: "FAILED" };
  }
}
