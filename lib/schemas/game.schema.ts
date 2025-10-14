import { z } from "zod";

export const gameTypeSchema = z.enum(["TCG", "BoardGame"]);

export const gameSchema = z.object({
  name: z.string().min(1, "Le nom du jeu est requis").max(100, "Le nom est trop long"),
  icon: z.string().url("L'URL de l'icône doit être valide"),
  banner: z.string().url("L'URL de la bannière doit être valide"),
  description: z.string().min(10, "La description doit contenir au moins 10 caractères").max(500, "La description est trop longue"),
  type: gameTypeSchema,
});

export const gameIdSchema = z.string().uuid("L'ID du jeu doit être un UUID valide");

export type GameInput = z.infer<typeof gameSchema>;
