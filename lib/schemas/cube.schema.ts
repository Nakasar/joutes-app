import { z } from "zod";

export const cubeVisibilitySchema = z.enum(["private", "unlisted", "public"]);

export const cubeSchema = z.object({
  name: z.string().min(1, "Le nom du cube est requis").max(100, "Le nom est trop long"),
  gameSlug: z.string().min(1, "Le jeu est requis").max(100),
  description: z.string().max(2000, "La description est trop longue").optional(),
  visibility: cubeVisibilitySchema.default("private"),
});

// Le jeu n'est pas modifiable : les cartes déjà présentes en dépendent, et les
// changer de jeu n'aurait pas de sens sans les retirer toutes.
export const cubeUpdateSchema = z.object({
  name: z.string().min(1, "Le nom du cube est requis").max(100, "Le nom est trop long").optional(),
  description: z.string().max(2000, "La description est trop longue").optional(),
  visibility: cubeVisibilitySchema.optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
);

export const cubePackSchema = z.strictObject({
  name: z.string().max(100, "Le nom est trop long").optional(),
  type: z.string().max(100, "Le type est trop long").optional(),
});

export const cubePackUpdateSchema = cubePackSchema.refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
);

export const cubeCardSchema = z.strictObject({
  cardId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  setCode: z.string().min(1).max(100),
  collectorNumber: z.string().min(1).max(100),
  image: z.string(),
});

export const cubeIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du cube doit être un ObjectId MongoDB valide");

export type CubeInput = z.infer<typeof cubeSchema>;
export type CubeUpdateInput = z.infer<typeof cubeUpdateSchema>;
export type CubePackInput = z.infer<typeof cubePackSchema>;
export type CubeCardInput = z.infer<typeof cubeCardSchema>;
