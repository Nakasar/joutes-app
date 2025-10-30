import { z } from "zod";

export const gameMatchPlayerSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du joueur doit être un ObjectId MongoDB valide"),
  username: z.string().min(1, "Le nom d'utilisateur est requis"),
  displayName: z.string().optional(),
  discriminator: z.string().regex(/^\d{4}$/, "Le discriminant doit être un nombre à 4 chiffres").optional(),
});

export const gameMatchSchema = z.object({
  gameId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du jeu doit être un ObjectId MongoDB valide"),
  playedAt: z.coerce.date(),
  lairId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du lair doit être un ObjectId MongoDB valide").optional(),
  players: z.array(gameMatchPlayerSchema).min(1, "Au moins un joueur est requis"),
});

export type GameMatchInput = z.infer<typeof gameMatchSchema>;
