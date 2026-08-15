import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID doit être un ObjectId MongoDB valide");

/**
 * L'attribution d'une actualité reprise d'un site extérieur. `null` la retire
 * — une actualité rédigée sur Joutes n'a pas de source à citer, et une
 * actualité importée puis entièrement réécrite ne doit plus en revendiquer.
 */
const newsSourceSchema = z.object({
  name: z.string().min(1, "Le nom de la source est requis").max(120, "Le nom de la source est trop long"),
  url: z.string().url("L'URL de la source doit être valide"),
});

const newsBaseSchema = z.object({
  title: z.string().min(1, "Le titre est requis").max(200, "Le titre est trop long"),
  summary: z.string().min(1, "Le résumé est requis").max(500, "Le résumé est trop long"),
  content: z.string().min(1, "Le contenu est requis"),
  banner: z.string().url("L'URL de la bannière doit être valide").optional(),
  source: newsSourceSchema.nullish(),
  gameIds: z.array(objectIdSchema),
  tags: z.array(z.string().min(1).max(50)),
});

export const createNewsSchema = newsBaseSchema.extend({
  gameIds: newsBaseSchema.shape.gameIds.default([]),
  tags: newsBaseSchema.shape.tags.default([]),
});

export const updateNewsSchema = newsBaseSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
);

export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
