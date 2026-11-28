"use server";

import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { createReport } from "@/lib/db/reports.ts";
import { isRateLimited, RATE_LIMITS } from "@/lib/net/rate-limit.ts";
import { createReportSchema } from "@/lib/schemas/report.schema.ts";
import { ReportableContentType } from "@/lib/types/Report.ts";

export type ReportContentResult = {
  success: boolean;
  /** Le contenu était déjà signalé par cet utilisateur : rien n'a été ajouté. */
  alreadyReported?: boolean;
  error?: string;
};

/**
 * Signale un contenu. Réservé aux utilisateurs connectés : un même utilisateur
 * ne peut signaler qu'une fois un contenu donné.
 */
export async function reportContent(input: {
  contentType: ReportableContentType;
  contentId: string;
  reason?: string;
}): Promise<ReportContentResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return { success: false, error: "Vous devez être connecté pour signaler un contenu." };
    }

    if (await isRateLimited(RATE_LIMITS.report, `user:${session.user.id}`)) {
      return { success: false, error: "Trop de signalements en peu de temps. Réessayez dans une heure." };
    }

    const parsed = createReportSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Signalement invalide." };
    }

    const created = await createReport({
      contentType: parsed.data.contentType,
      contentId: parsed.data.contentId,
      reportedBy: session.user.id,
      reason: parsed.data.reason,
    });

    return created ? { success: true } : { success: true, alreadyReported: true };
  } catch (error) {
    console.error("Erreur lors du signalement d'un contenu:", error);
    return { success: false, error: "Erreur lors de l'enregistrement du signalement." };
  }
}
