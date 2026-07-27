import { z } from "zod";
import {
  CUBE_DRAW_MAX_CARDS_PER_PLAYER,
  CUBE_DRAW_MAX_PACKS_PER_PLAYER,
  CUBE_DRAW_MAX_PLAYERS,
  CUBE_DRAW_MAX_RULES,
  CUBE_DRAW_MIN_PLAYERS,
  CUBE_PACK_CARD_MAX_QUANTITY,
} from "@/lib/constants/cubes";

export const cubeVisibilitySchema = z.enum(["private", "unlisted", "public"]);

export const cubeDrawRuleSchema = z.strictObject({
  attribute: z.string().min(1).max(50),
  value: z.string().min(1).max(100),
  count: z.number().int().min(1).max(CUBE_DRAW_MAX_CARDS_PER_PLAYER),
});

export const cubeDrawConfigSchema = z.strictObject({
  mode: z.enum(["packs", "random"]),
  packsPerPlayer: z.number().int().min(1).max(CUBE_DRAW_MAX_PACKS_PER_PLAYER),
  cardsPerPlayer: z.number().int().min(1).max(CUBE_DRAW_MAX_CARDS_PER_PLAYER),
  rules: z.array(cubeDrawRuleSchema).max(CUBE_DRAW_MAX_RULES),
  allowDuplicates: z.boolean(),
}).refine(
  // Les règles se servent dans le total : en demander davantage rendrait le
  // tirage impossible à satisfaire, autant le refuser à la configuration.
  (data) => data.mode !== "random"
    || data.rules.reduce((total, rule) => total + rule.count, 0) <= data.cardsPerPlayer,
  { message: "Les règles demandent plus de cartes que le total par joueur", path: ["rules"] },
);

export const cubeDrawRequestSchema = z.strictObject({
  players: z.number().int().min(CUBE_DRAW_MIN_PLAYERS).max(CUBE_DRAW_MAX_PLAYERS),
});

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
  draw: cubeDrawConfigSchema.optional(),
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

/** Quantité visée pour une carte dans un paquet ; zéro la retire entièrement. */
export const cubeCardQuantitySchema = cubeCardSchema.extend({
  quantity: z.number().int().min(0).max(CUBE_PACK_CARD_MAX_QUANTITY),
});

export const cubeIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du cube doit être un ObjectId MongoDB valide");

export type CubeInput = z.infer<typeof cubeSchema>;
export type CubeUpdateInput = z.infer<typeof cubeUpdateSchema>;
export type CubePackInput = z.infer<typeof cubePackSchema>;
export type CubeCardInput = z.infer<typeof cubeCardSchema>;
