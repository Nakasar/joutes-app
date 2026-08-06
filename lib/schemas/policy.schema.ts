import { z } from "zod";
import { defaultLocale, locales } from "@/i18n/config";

export const createPolicySchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis").max(200, "Le titre est trop long"),
  content: z.string().trim().min(1, "Le contenu est requis").max(20000, "Le contenu est trop long"),
  originalLang: z.enum(locales).default(defaultLocale),
  source: z.string().trim().max(500, "La source est trop longue").optional(),
});

export const policyVoteSchema = z.object({
  vote: z.enum(["positive", "negative"]),
});

export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
