"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { deleteReportsForContent, ignoreReportsForContent } from "@/lib/db/reports.ts";
import { getReportedContentPreview, moderateReportedContent } from "@/lib/db/reportable-content.ts";
import { moderateReportSchema } from "@/lib/schemas/report.schema.ts";
import { ReportableContentType } from "@/lib/types/Report.ts";

export type ModerationResult = { success: boolean; error?: string };

type ModerationInput = { contentType: ReportableContentType; contentId: string };

/**
 * Masque les signalements d'un contenu : ils ne réapparaîtront dans la liste
 * que si le contenu est signalé à nouveau.
 */
export async function ignoreReportedContentAction(input: ModerationInput): Promise<ModerationResult> {
  try {
    const session = await requireAdmin();

    const parsed = moderateReportSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Signalement invalide" };
    }

    await ignoreReportsForContent({
      contentType: parsed.data.contentType,
      contentId: parsed.data.contentId,
      ignoredBy: session.user.id,
    });

    revalidatePath("/admin/reports");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'ignorance d'un signalement:", error);
    return { success: false, error: "Erreur lors du traitement du signalement" };
  }
}

/**
 * Supprime le contenu signalé (pour un profil utilisateur, remplace seulement
 * la biographie), puis efface ses signalements.
 */
export async function deleteReportedContentAction(input: ModerationInput): Promise<ModerationResult> {
  try {
    await requireAdmin();

    const parsed = moderateReportSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Signalement invalide" };
    }

    const { contentType, contentId } = parsed.data;
    const moderated = await moderateReportedContent(contentType, contentId);

    if (!moderated) {
      // La modération peut échouer parce que le contenu n'existe plus (le
      // signalement n'a alors plus lieu d'être) ou parce que la suppression
      // s'est mal passée : dans ce second cas le signalement doit rester en
      // attente plutôt que d'être clos sans modération.
      const preview = await getReportedContentPreview(contentType, contentId);

      if (preview.exists) {
        return { success: false, error: "Le contenu n'a pas pu être supprimé, le signalement reste en attente." };
      }

      await deleteReportsForContent({ contentType, contentId });
      revalidatePath("/admin/reports");

      return { success: true, error: "Le contenu n'existait plus, le signalement a été clos." };
    }

    await deleteReportsForContent({ contentType, contentId });

    revalidatePath("/admin/reports");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression d'un contenu signalé:", error);
    return { success: false, error: "Erreur lors de la suppression du contenu" };
  }
}
