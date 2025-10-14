import { z } from "zod";

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID doit être un ObjectId MongoDB valide");

export const lairSchema = z.object({
  name: z.string().min(1, "Le nom du lieu est requis").max(100, "Le nom est trop long"),
  banner: z.string().url("L'URL de la bannière doit être valide"),
  games: z.array(objectIdSchema).default([]),
});

export const lairIdSchema = objectIdSchema;

export type LairInput = z.infer<typeof lairSchema>;
