import { z } from "zod";
import { REPORTABLE_CONTENT_TYPES } from "@/lib/types/Report";

export const reportableContentTypeSchema = z.enum(REPORTABLE_CONTENT_TYPES, {
  message: "Type de contenu invalide",
});

export const createReportSchema = z.object({
  contentType: reportableContentTypeSchema,
  contentId: z.string().min(1, "L'identifiant du contenu est requis").max(200, "L'identifiant est trop long"),
  reason: z
    .string()
    .trim()
    .max(1000, "Le motif est trop long")
    .optional()
    .transform((reason) => (reason ? reason : undefined)),
});

export const moderateReportSchema = z.object({
  contentType: reportableContentTypeSchema,
  contentId: z.string().min(1, "L'identifiant du contenu est requis").max(200, "L'identifiant est trop long"),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ModerateReportInput = z.infer<typeof moderateReportSchema>;
