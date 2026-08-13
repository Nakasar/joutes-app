import { z } from "zod";
import { GAME_FEATURE_KEYS } from "@/lib/constants/game-features";
import {
  tournamentResultModeSchema,
  tournamentScenarioSchema,
  tournamentSwissPairingSchema,
  tournamentTiebreakersSchema,
} from "@/lib/schemas/tournament.schema";

export const gameTypeSchema = z.enum(["TCG", "BoardGame", "VideoGame", "Miniatures", "Other"]);

/**
 * Fanions de fonctionnalités. Chaque clé est facultative : un fanion absent
 * vaut « désactivé », ce que tout le code lit déjà par vérité (`features?.cards`).
 */
export const gameFeaturesSchema = z.object(
  Object.fromEntries(GAME_FEATURE_KEYS.map((key) => [key, z.boolean().optional()]))
) as z.ZodType<Partial<Record<(typeof GAME_FEATURE_KEYS)[number], boolean>>>;

export const gameSchema = z.object({
  name: z.string().min(1, "Le nom du jeu est requis").max(100, "Le nom est trop long"),
  slug: z.string().min(1, "Le slug doit contenir au moins 3 caractères").max(20, "Le slug est trop long").optional(),
  icon: z.url("L'URL de l'icône doit être valide").optional(),
  banner: z.url("L'URL de la bannière doit être valide").optional(),
  description: z.string().min(10, "La description doit contenir au moins 10 caractères").max(500, "La description est trop longue"),
  type: gameTypeSchema,
  features: gameFeaturesSchema.optional(),
});

/**
 * Réglages de tournoi par défaut d'un jeu (administration). Chaque champ est
 * facultatif : absent, il laisse la main au preset livré avec le jeu.
 *
 * `statsPresetKey` porte trois états, comme le document qu'il alimente :
 * absent (suivre le catalogue), `null` (aucun preset), ou une clé.
 */
export const gameTournamentDefaultsSchema = z.object({
  statsPresetKey: z.string().min(1).max(60).nullable().optional(),
  tiebreakers: tournamentTiebreakersSchema.optional(),
  fixedScoring: z
    .object({
      win: z.number().int().min(-99).max(999),
      loss: z.number().int().min(-99).max(999),
      draw: z.number().int().min(-99).max(999),
    })
    .optional(),
  swissPairing: tournamentSwissPairingSchema.optional(),
  bestOf: z.number().int().min(1).max(9).optional(),
  resultMode: tournamentResultModeSchema.optional(),
  requireMatchStats: z.boolean().optional(),
  // Catalogue de scénarios proposés aux organisateurs. Plus large que le pool
  // d'une phase : il couvre la saison d'un jeu, pas une seule ronde.
  scenarios: z.array(tournamentScenarioSchema).max(200).optional(),
});

export type GameTournamentDefaultsInput = z.infer<typeof gameTournamentDefaultsSchema>;

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
export const gameIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du jeu doit être un ObjectId MongoDB valide");

export type GameInput = z.infer<typeof gameSchema>;
