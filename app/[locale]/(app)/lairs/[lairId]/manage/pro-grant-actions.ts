"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/middleware/admin.ts";
import { lairIdSchema } from "@/lib/schemas/lair.schema.ts";
import { grantProToLair, revokeProFromLair } from "@/lib/db/lairs.ts";

/**
 * L'octroi de Joutes Pro à un lieu, par l'équipe.
 *
 * `requireAdmin()` et non `requireAdminOrOwner()` : c'est la seule action de cet
 * écran qu'un gérant ne doit pas pouvoir déclencher. Le rendu conditionnel de la
 * carte n'est qu'une commodité — une action serveur reste appelable telle
 * quelle, et c'est ici qu'elle est vraiment fermée.
 */

export type LairProGrantError =
  | "INVALID_LAIR"
  | "REASON_REQUIRED"
  | "NOT_FOUND"
  | "NOT_GRANTED"
  | "FAILED";

export type LairProGrantResult =
  | { success: true }
  | { success: false; error: LairProGrantError };

const MAX_REASON = 200;

/**
 * Offre l'accès Pro au lieu.
 *
 * Le motif est exigé côté serveur et pas seulement dans le formulaire : dans six
 * mois, « pourquoi cette boutique a-t-elle Pro gratuitement ? » sera une vraie
 * question, et un champ vide n'y répondra pas.
 */
export async function grantProToLairAction(
  lairId: string,
  reason: string
): Promise<LairProGrantResult> {
  try {
    const session = await requireAdmin();

    const parsed = lairIdSchema.safeParse(lairId);
    if (!parsed.success) {
      return { success: false, error: "INVALID_LAIR" };
    }

    const motif = reason.trim().slice(0, MAX_REASON);
    if (motif.length === 0) {
      return { success: false, error: "REASON_REQUIRED" };
    }

    const granted = await grantProToLair({
      lairId: parsed.data,
      grantedBy: session.user.id,
      reason: motif,
    });

    if (!granted) {
      return { success: false, error: "NOT_FOUND" };
    }

    revalidateLair(parsed.data);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'octroi de Joutes Pro à un lieu:", error);
    return { success: false, error: "FAILED" };
  }
}

/** Retire l'accès offert. Un lieu parrainé par un abonnement le reste. */
export async function revokeProFromLairAction(lairId: string): Promise<LairProGrantResult> {
  try {
    await requireAdmin();

    const parsed = lairIdSchema.safeParse(lairId);
    if (!parsed.success) {
      return { success: false, error: "INVALID_LAIR" };
    }

    const outcome = await revokeProFromLair(parsed.data);

    if (outcome === "not-found") {
      return { success: false, error: "NOT_FOUND" };
    }

    if (outcome === "not-granted") {
      return { success: false, error: "NOT_GRANTED" };
    }

    revalidateLair(parsed.data);

    return { success: true };
  } catch (error) {
    console.error("Erreur lors du retrait de Joutes Pro à un lieu:", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * La gestion **et** la vitrine : l'octroi ouvre la personnalisation, dont le
 * résultat se voit sur la page publique. N'invalider que la gestion aurait
 * laissé la vitrine sur son rendu d'avant.
 */
function revalidateLair(lairId: string) {
  revalidatePath(`/lairs/${lairId}/manage`);
  revalidatePath(`/lairs/${lairId}`);
  revalidatePath("/lairs");
}
