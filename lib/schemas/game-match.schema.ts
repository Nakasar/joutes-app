import { z } from "zod";

export const gameMatchRatingSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID de l'utilisateur doit être un ObjectId MongoDB valide"),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

export const gameMatchMVPVoteSchema = z.object({
  voterId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du votant doit être un ObjectId MongoDB valide"),
  votedForId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du joueur voté doit être un ObjectId MongoDB valide"),
});

export const gameMatchSchema = z.object({
  gameId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du jeu doit être un ObjectId MongoDB valide"),
  playedAt: z.coerce.date(),
  lairId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du lair doit être un ObjectId MongoDB valide").optional(),
  playerIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du joueur doit être un ObjectId MongoDB valide")).min(1, "Au moins un joueur est requis"),
  ratings: z.array(gameMatchRatingSchema).optional(),
  mvpVotes: z.array(gameMatchMVPVoteSchema).optional(),
  winners: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du gagnant doit être un ObjectId MongoDB valide")).optional(),
});

export type GameMatchInput = z.infer<typeof gameMatchSchema>;
