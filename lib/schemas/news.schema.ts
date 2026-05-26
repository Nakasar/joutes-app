import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID doit être un ObjectId MongoDB valide");

export const createNewsSchema = z.object({
  title: z.string().min(1, "Le titre est requis").max(200, "Le titre est trop long"),
  summary: z.string().min(1, "Le résumé est requis").max(500, "Le résumé est trop long"),
  content: z.string().min(1, "Le contenu est requis"),
  gameIds: z.array(objectIdSchema).default([]),
  tags: z.array(z.string().min(1).max(50)).default([]),
});

export const updateNewsSchema = createNewsSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
);

export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
