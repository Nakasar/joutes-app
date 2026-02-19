import { z } from "zod";

export const deckVisibilitySchema = z.enum(["private", "public"]);

export const deckSchema = z.object({
  name: z.string().min(1, "Le nom du deck est requis").max(100, "Le nom est trop long"),
  gameId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du jeu doit être un ObjectId MongoDB valide"),
  url: z.string().url("L'URL doit être valide").optional().or(z.literal("")),
  description: z.string().max(2000, "La description est trop longue").optional(),
  visibility: deckVisibilitySchema.default("private"),
});

export const deckUpdateSchema = deckSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
);

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
export const deckIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du deck doit être un ObjectId MongoDB valide");

export type DeckInput = z.infer<typeof deckSchema>;
export type DeckUpdateInput = z.infer<typeof deckUpdateSchema>;
