import { z } from "zod";

export const tournamentPhaseTypeSchema = z.enum(["freeform", "swiss", "bracket"]);
export const tournamentMatchFormatSchema = z.enum(["BO1", "BO2", "BO3", "BO5"]);

export const createTournamentSchema = z.object({
  name: z.string().min(1, "Le nom du tournoi est requis").max(200),
  eventId: z.string().optional(),
  gameId: z.string().optional(),
  settings: z
    .object({
      allowSelfReporting: z.boolean().default(true),
      requireConfirmation: z.boolean().default(false),
    })
    .default({ allowSelfReporting: true, requireConfirmation: false }),
});

export const updateTournamentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["draft", "in-progress", "completed"]).optional(),
  currentPhaseId: z.string().nullable().optional(),
  settings: z
    .object({
      allowSelfReporting: z.boolean(),
      requireConfirmation: z.boolean(),
    })
    .partial()
    .optional(),
  organizerIds: z.array(z.string()).optional(),
});

export const addTournamentPlayerSchema = z.object({
  displayName: z.string().min(1, "Le nom du joueur est requis").max(100),
  userId: z.string().optional(),
  seed: z.number().int().min(1).optional(),
});

export const updateTournamentPlayerSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  seed: z.number().int().min(1).nullable().optional(),
  status: z.enum(["active", "dropped"]).optional(),
});

export const createTournamentPhaseSchema = z.object({
  name: z.string().min(1, "Le nom de la phase est requis").max(200),
  type: tournamentPhaseTypeSchema,
  matchFormat: tournamentMatchFormatSchema.default("BO3"),
  plannedRounds: z.number().int().min(1).optional(),
  topCut: z.number().int().min(2).optional(),
  order: z.number().int().min(0).optional(),
});

export const updateTournamentPhaseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  // Type only editable while the phase has not started (enforced in the domain layer).
  type: tournamentPhaseTypeSchema.optional(),
  matchFormat: tournamentMatchFormatSchema.optional(),
  plannedRounds: z.number().int().min(1).nullable().optional(),
  topCut: z.number().int().min(2).nullable().optional(),
  order: z.number().int().min(0).optional(),
  status: z.enum(["not-started", "in-progress", "completed"]).optional(),
});

export const createTournamentMatchSchema = z.object({
  player1Id: z.string(),
  player2Id: z.string().nullable(),
  bracketPosition: z.string().max(20).optional(),
});

export const reportTournamentMatchSchema = z.object({
  action: z.literal("report"),
  player1Score: z.number().int().min(0),
  player2Score: z.number().int().min(0),
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
