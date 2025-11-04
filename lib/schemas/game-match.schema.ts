import { z } from "zod";

export const gameMatchSchema = z.object({
  gameId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du jeu doit être un ObjectId MongoDB valide"),
  playedAt: z.coerce.date(),
  lairId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du lair doit être un ObjectId MongoDB valide").optional(),
  playerIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du joueur doit être un ObjectId MongoDB valide")).min(1, "Au moins un joueur est requis"),
});

export type GameMatchInput = z.infer<typeof gameMatchSchema>;
