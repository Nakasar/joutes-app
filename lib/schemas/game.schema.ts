import { z } from "zod";

export const gameTypeSchema = z.enum(["TCG", "BoardGame", "VideoGame", "Other"]);

export const gameSchema = z.object({
  name: z.string().min(1, "Le nom du jeu est requis").max(100, "Le nom est trop long"),
  slug: z.string().min(1, "Le slug doit contenir au moins 3 caractères").max(20, "Le slug est trop long").optional(),
  icon: z.url("L'URL de l'icône doit être valide").optional(),
  banner: z.url("L'URL de la bannière doit être valide").optional(),
  description: z.string().min(10, "La description doit contenir au moins 10 caractères").max(500, "La description est trop longue"),
  type: gameTypeSchema,
});

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
export const gameIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du jeu doit être un ObjectId MongoDB valide");

export type GameInput = z.infer<typeof gameSchema>;
