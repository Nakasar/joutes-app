import { z } from "zod";

export const tournamentPhaseTypeSchema = z.enum(["freeform", "swiss", "elimination", "bracket"]);
export const tournamentResultModeSchema = z.enum(["points", "selection"]);
export const tournamentScoringMethodSchema = z.enum(["fixed", "rank_offset"]);
export const tournamentEliminationSeedingSchema = z.enum(["standings", "random"]);

const fixedScoringSchema = z.object({
  win: z.number().int(),
  loss: z.number().int(),
  draw: z.number().int(),
});

export const createTournamentSchema = z.object({
  name: z.string().min(1, "Le nom du tournoi est requis").max(200),
  eventId: z.string().optional(),
  gameId: z.string().optional(),
  settings: z
    .object({
      allowSelfReporting: z.boolean().default(true),
      requireConfirmation: z.boolean().default(false),
      preRegistration: z.boolean().default(false),
    })
    .default({ allowSelfReporting: true, requireConfirmation: false, preRegistration: false }),
});

export const updateTournamentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["draft", "in-progress", "completed"]).optional(),
  currentPhaseId: z.string().nullable().optional(),
  settings: z
    .object({
      allowSelfReporting: z.boolean(),
      requireConfirmation: z.boolean(),
      preRegistration: z.boolean(),
    })
    .partial()
    .optional(),
  organizerIds: z.array(z.string()).optional(),
});

export const createAnnouncementSchema = z.object({
  message: z.string().min(1, "Le message est requis").max(500),
  level: z.enum(["info", "urgent"]).default("info"),
});

// Contrôle du minuteur : démarrer (avec une durée) ou arrêter.
export const timerActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    durationSeconds: z.number().int().min(1).max(86400),
  }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("stop") }),
]);

// Rejoindre un tournoi via son code. Sans session, `displayName` est requis
// (joueur invité) ; avec session, il est ignoré (nom du compte utilisé).
export const joinTournamentSchema = z.object({
  // Normalise (trim + majuscules) puis valide le format : 9 caractères A-Z0-9.
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{9}$/, "Code de participation invalide"),
  displayName: z.string().min(1).max(100).optional(),
});

export const addTournamentPlayerSchema = z.object({
  // Identifiant du joueur : email, tag `username#discriminator`, ou simple
  // nom d'utilisateur (ajouté alors comme invité). La résolution est faite
  // côté domaine (lib/db/tournaments.ts).
  identifier: z.string().min(1, "Un identifiant de joueur est requis").max(150),
  seed: z.number().int().min(1).optional(),
});

export const updateTournamentPlayerSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  seed: z.number().int().min(1).nullable().optional(),
  status: z.enum(["registered", "pre-registered", "dropped"]).optional(),
});

export const createTournamentPhaseSchema = z
  .object({
    name: z.string().min(1, "Le nom de la phase est requis").max(200),
    type: tournamentPhaseTypeSchema,
    // Best-of-n : nombre de parties (défaut best-of-1).
    bestOf: z.number().int().min(1).max(9).default(1),
    resultMode: tournamentResultModeSchema.default("selection"),
    scoringMethod: tournamentScoringMethodSchema.default("fixed"),
    fixedScoring: fixedScoringSchema.optional(),
    rankOffsets: z.array(z.number().int()).min(1).max(64).optional(),
    eliminationSeeding: tournamentEliminationSeedingSchema.default("standings"),
    plannedRounds: z.number().int().min(1).optional(),
    // Joueurs qualifiés à l'entrée de la phase.
    topCut: z.number().int().min(2).optional(),
    // Bornes du nombre de joueurs par match généré (défaut : duel 2-2).
    minPlayersPerMatch: z.number().int().min(2).max(16).default(2),
    maxPlayersPerMatch: z.number().int().min(2).max(16).default(2),
    order: z.number().int().min(0).optional(),
  })
  .refine((v) => v.maxPlayersPerMatch >= v.minPlayersPerMatch, {
    message: "Le nombre maximal de joueurs doit être supérieur ou égal au minimum",
    path: ["maxPlayersPerMatch"],
  });

export const updateTournamentPhaseSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    // Type only editable while the phase has not started (enforced in the domain layer).
    type: tournamentPhaseTypeSchema.optional(),
    bestOf: z.number().int().min(1).max(9).optional(),
    resultMode: tournamentResultModeSchema.optional(),
    scoringMethod: tournamentScoringMethodSchema.optional(),
    fixedScoring: fixedScoringSchema.optional(),
    rankOffsets: z.array(z.number().int()).min(1).max(64).optional(),
    eliminationSeeding: tournamentEliminationSeedingSchema.optional(),
    plannedRounds: z.number().int().min(1).nullable().optional(),
    topCut: z.number().int().min(2).nullable().optional(),
    minPlayersPerMatch: z.number().int().min(2).max(16).optional(),
    maxPlayersPerMatch: z.number().int().min(2).max(16).optional(),
    order: z.number().int().min(0).optional(),
    status: z.enum(["not-started", "in-progress", "completed"]).optional(),
  })
  .refine(
    (v) =>
      v.minPlayersPerMatch === undefined ||
      v.maxPlayersPerMatch === undefined ||
      v.maxPlayersPerMatch >= v.minPlayersPerMatch,
    {
      message: "Le nombre maximal de joueurs doit être supérieur ou égal au minimum",
      path: ["maxPlayersPerMatch"],
    }
  );

export const createTournamentMatchSchema = z.object({
  // Tournament player ids; a single player creates a BYE, 3+ players a
  // multiplayer match.
  players: z
    .array(z.string())
    .min(1, "Au moins un joueur est requis")
    .max(16)
    .refine((ids) => new Set(ids).size === ids.length, "Un joueur ne peut apparaître qu'une fois dans un match"),
  bracketPosition: z.string().max(20).optional(),
});

export const reportTournamentMatchSchema = z.object({
  action: z.literal("report"),
  // Résultat partie par partie du best-of. Selon le resultMode de la phase :
  // - selection : chaque partie fournit un winnerId (null = partie nulle).
  // - points : chaque partie fournit `points` (points par joueur de tournoi) ;
  //   le vainqueur en est déduit.
  games: z
    .array(
      z
        .object({
          winnerId: z.string().nullable().optional(),
          points: z.record(z.string(), z.number().int()).optional(),
        })
        .refine((g) => g.winnerId !== undefined || g.points !== undefined, {
          message: "Chaque partie doit renseigner un vainqueur (ou nul) ou des points",
        })
    )
    .min(1, "Au moins une partie doit être renseignée")
    .max(9),
});

export const confirmTournamentMatchSchema = z.object({
  action: z.literal("confirm"),
});

export const disputeTournamentMatchSchema = z.object({
  action: z.literal("dispute"),
});

export const updateTournamentMatchSchema = z.discriminatedUnion("action", [
  reportTournamentMatchSchema,
  confirmTournamentMatchSchema,
  disputeTournamentMatchSchema,
]);

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
export type AddTournamentPlayerInput = z.infer<typeof addTournamentPlayerSchema>;
export type UpdateTournamentPlayerInput = z.infer<typeof updateTournamentPlayerSchema>;
export type CreateTournamentPhaseInput = z.infer<typeof createTournamentPhaseSchema>;
export type UpdateTournamentPhaseInput = z.infer<typeof updateTournamentPhaseSchema>;
export type CreateTournamentMatchInput = z.infer<typeof createTournamentMatchSchema>;
export type UpdateTournamentMatchInput = z.infer<typeof updateTournamentMatchSchema>;
export type JoinTournamentInput = z.infer<typeof joinTournamentSchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type TimerActionInput = z.infer<typeof timerActionSchema>;
