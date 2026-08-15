import { z } from "zod";
import { defaultLocale, locales } from "@/i18n/config";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID doit être un ObjectId MongoDB valide");

const localeSchema = z.enum(locales, { message: "Langue non prise en charge" });

/**
 * L'attribution d'une actualité reprise d'un site extérieur. `null` la retire
 * — une actualité rédigée sur Joutes n'a pas de source à citer, et une
 * actualité importée puis entièrement réécrite ne doit plus en revendiquer.
 */
const newsSourceSchema = z.object({
  name: z.string().min(1, "Le nom de la source est requis").max(120, "Le nom de la source est trop long"),
  // `url()` seul ne suffit pas : il accepte `javascript:` et `data:`, qui
  // finiraient dans le `href` du lien vers l'article d'origine. Une source est
  // une page qu'on peut aller lire, donc http(s) et rien d'autre.
  url: z
    .string()
    .url("L'URL de la source doit être valide")
    .refine(
      (value) => /^https?:$/.test(new URL(value).protocol),
      "L'URL de la source doit être en http(s)"
    ),
});

const newsBaseSchema = z.object({
  title: z.string().min(1, "Le titre est requis").max(200, "Le titre est trop long"),
  summary: z.string().min(1, "Le résumé est requis").max(500, "Le résumé est trop long"),
  content: z.string().min(1, "Le contenu est requis"),
  originalLang: localeSchema,
  banner: z.string().url("L'URL de la bannière doit être valide").optional(),
  source: newsSourceSchema.nullish(),
  gameIds: z.array(objectIdSchema),
  tags: z.array(z.string().min(1).max(50)),
});

export const createNewsSchema = newsBaseSchema.extend({
  // Les actualités rédigées avant que la langue soit notée sont relues en `fr` ;
  // un client qui ne l'envoie pas se voit appliquer la même règle.
  originalLang: localeSchema.default(defaultLocale),
  gameIds: newsBaseSchema.shape.gameIds.default([]),
  tags: newsBaseSchema.shape.tags.default([]),
});

/**
 * Une traduction d'actualité. Les trois textes sont acceptés vides : une
 * traduction se saisit en plusieurs fois, et un champ laissé blanc affiche la
 * VO plutôt que de bloquer l'enregistrement du reste.
 */
export const newsTranslationSchema = z.object({
  title: z.string().max(200, "Le titre est trop long").default(""),
  summary: z.string().max(500, "Le résumé est trop long").default(""),
  content: z.string().default(""),
});

export const updateNewsSchema = newsBaseSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
);

export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
export type NewsTranslationPayload = z.infer<typeof newsTranslationSchema>;
