import { z } from "zod";
import { defaultLocale, locales } from "@/i18n/config";
import { MAX_ERRATA_CARDS } from "@/lib/types/errata";

export const createErrataSchema = z.object({
  cardIds: z
    .array(z.string().min(1))
    .min(1, "Un errata doit être lié à au moins une carte")
    .max(MAX_ERRATA_CARDS, `Un errata ne peut pas être lié à plus de ${MAX_ERRATA_CARDS} cartes`),
  type: z.enum(["errata", "clarification", "ruling"]),
  details: z.string().trim().min(1, "Le contenu de l'errata est requis").max(5000, "Le contenu est trop long"),
  originalLang: z.enum(locales).default(defaultLocale),
  source: z.string().trim().max(500, "La source est trop longue").optional(),
  // Date à laquelle l'errata a été publié par l'éditeur, distincte de la date
  // de saisie : par défaut « aujourd'hui », le cas courant d'une contribution
  // qui relaie une annonce du jour.
  errataDate: z.coerce.date().optional(),
});

export const errataVoteSchema = z.object({
  vote: z.enum(["positive", "negative"]),
});

export type CreateErrataInput = z.infer<typeof createErrataSchema>;
