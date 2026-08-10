import { z } from "zod";
import {
  MAX_ARMY_NAME_LENGTH,
  MAX_ARMY_UNITS,
  MAX_NOTES_LENGTH,
  MAX_SCENARIO_LENGTH,
  MAX_UNIT_NAME_LENGTH,
  MAX_UNIT_QUANTITY,
} from "@/lib/battle-reports/army";

/**
 * Une ligne de liste d'armée. `productId` est l'identifiant d'un produit **au
 * sein d'un jeu** (`spearhead-vader`), et non un ObjectId : il n'a donc pas la
 * forme des autres identifiants de ce fichier. Il reste facultatif, une
 * figurine absente du catalogue devant pouvoir être saisie à la main.
 */
export const battleReportArmyUnitSchema = z.object({
  productId: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1, "Le nom de la figurine est requis").max(MAX_UNIT_NAME_LENGTH),
  quantity: z.number().int().min(1).max(MAX_UNIT_QUANTITY),
});

export const battleReportArmySchema = z.object({
  name: z.string().trim().max(MAX_ARMY_NAME_LENGTH).optional(),
  units: z.array(battleReportArmyUnitSchema).max(MAX_ARMY_UNITS).default([]),
});

export const battleReportSchema = z.object({
  scenario: z.string().trim().max(MAX_SCENARIO_LENGTH).optional(),
  notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  armies: z
    .record(
      z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du joueur doit être un ObjectId MongoDB valide"),
      battleReportArmySchema
    )
    .optional(),
});

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
  winnerIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du gagnant doit être un ObjectId MongoDB valide")).optional(),
  decks: z.record(z.string(), z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du deck doit être un ObjectId MongoDB valide")).optional(),
  // Présent = la partie est saisie en rapport de bataille, même vide.
  battleReport: battleReportSchema.optional(),
});

export type GameMatchInput = z.infer<typeof gameMatchSchema>;
export type BattleReportInput = z.infer<typeof battleReportSchema>;
export type BattleReportArmyInput = z.infer<typeof battleReportArmySchema>;
