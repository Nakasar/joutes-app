"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminOrOwner } from "@/lib/middleware/admin.ts";
import { lairIdSchema } from "@/lib/schemas/lair.schema.ts";
import {
  lairCustomizationSchema,
  lairNewsCollectionSchema,
  type LairCustomizationInput,
} from "@/lib/schemas/lair-customization.schema.ts";
import * as lairsDb from "@/lib/db/lairs.ts";
import { isLairPro } from "@/lib/lairs/pro.ts";
import type { LairNewsItem } from "@/lib/types/Lair";

/**
 * Les échecs, en codes plutôt qu'en phrases : ces actions ne savent pas dans
 * quelle langue la page est rendue, le formulaire qui les appelle si.
 */
export type LairCustomizationError =
  | "INVALID"
  | "NOT_FOUND"
  | "PRO_REQUIRED"
  | "FAILED";

export type LairCustomizationResult =
  | { success: true }
  | { success: false; error: LairCustomizationError; issues?: Record<string, string> };

/** Les messages de Zod, à plat, pour que le formulaire les repose sur ses champs. */
function issuesOf(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "_", issue.message])
  );
}

/**
 * Enregistre la personnalisation de la vitrine.
 *
 * Ce que l'abonnement déverrouille : la **marque blanche** — logo, accent,
 * teinte des surfaces, ordre des sections — et les **contenus intégrés**
 * (`about.videoUrl`). Le reste — actualités, présentation, photos, horaires,
 * contact, liens, événement à la une — reste ouvert à tout lieu, qui garde
 * ainsi une page complète et un agenda public sans abonnement. La bannière
 * n'en fait pas partie bien que la maquette la cite : elle se règle déjà
 * librement dans l'onglet « Détails », et la fermer ici retirerait à des lieux
 * existants quelque chose dont ils se servent.
 *
 * Le contrôle est refait ici et non seulement dans le formulaire : un champ
 * désactivé dans le navigateur ne protège rien, l'action reste appelable
 * telle quelle. Les champs réservés ne sont pas refusés en bloc — la
 * sauvegarde **conserve la valeur déjà en base** pour eux et enregistre le
 * reste. Un lieu dont l'abonnement s'est arrêté peut ainsi continuer à tenir
 * ses horaires à jour sans que le formulaire lui oppose un mur, et sans perdre
 * l'accent qu'il avait choisi du temps de son abonnement.
 */
export async function updateLairCustomization(
  lairId: string,
  input: LairCustomizationInput
): Promise<LairCustomizationResult> {
  try {
    await requireAdminOrOwner(lairId);
    const validatedId = lairIdSchema.parse(lairId);

    const parsed = lairCustomizationSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID", issues: issuesOf(parsed.error) };
    }

    const lair = await lairsDb.getLairById(validatedId);
    if (!lair) {
      return { success: false, error: "NOT_FOUND" };
    }

    const data = parsed.data;
    const isPro = await isLairPro(validatedId);
    const previous = lair.options ?? {};

    const theme = isPro
      ? data.theme
      : // Hors Pro : la marque blanche reste telle qu'elle était.
        previous.theme;

    const about = data.about && {
      ...data.about,
      videoUrl: isPro ? data.about.videoUrl : previous.about?.videoUrl,
    };

    await lairsDb.updateLair(validatedId, {
      options: {
        ...previous,
        theme,
        sections: isPro ? data.sections : previous.sections,
        links: data.links,
        contact: data.contact,
        openingHours: data.openingHours,
        about,
        featuredEventId: data.featuredEventId,
      },
    });

    revalidatePath(`/lairs/${validatedId}`);
    revalidatePath(`/lairs/${validatedId}/manage`);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'enregistrement de la personnalisation du lieu:", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * Remplace la liste des actualités du lieu.
 *
 * La collection entière plutôt qu'une annonce à la fois : l'épinglage est une
 * propriété de la liste — une seule annonce peut la porter —, et l'écrire
 * article par article ouvrirait une fenêtre où deux le sont, ou aucune.
 */
export async function updateLairNews(
  lairId: string,
  news: LairNewsItem[]
): Promise<LairCustomizationResult> {
  try {
    await requireAdminOrOwner(lairId);
    const validatedId = lairIdSchema.parse(lairId);

    const parsed = lairNewsCollectionSchema.safeParse(news);
    if (!parsed.success) {
      return { success: false, error: "INVALID", issues: issuesOf(parsed.error) };
    }

    const lair = await lairsDb.getLairById(validatedId);
    if (!lair) {
      return { success: false, error: "NOT_FOUND" };
    }

    await lairsDb.updateLair(validatedId, {
      options: { ...(lair.options ?? {}), news: parsed.data },
    });

    revalidatePath(`/lairs/${validatedId}`);
    revalidatePath(`/lairs/${validatedId}/manage`);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'enregistrement des actualités du lieu:", error);
    return { success: false, error: "FAILED" };
  }
}
