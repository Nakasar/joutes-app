import { z } from "zod";

export const lairSchema = z.object({
  name: z.string().min(1, "Le nom du lieu est requis").max(100, "Le nom est trop long"),
  banner: z.string().url("L'URL de la bannière doit être valide"),
  games: z.array(z.string().uuid("Chaque ID de jeu doit être un UUID valide")).default([]),
});

export const lairIdSchema = z.string().uuid("L'ID du lieu doit être un UUID valide");

export type LairInput = z.infer<typeof lairSchema>;
