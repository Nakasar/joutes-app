import { z } from "zod";

// Types de phases de tournoi
export const phaseTypeSchema = z.enum(['swiss', 'bracket']);

// Types de match (Best Of)
export const matchTypeSchema = z.enum(['BO1', 'BO2', 'BO3', 'BO5']);

// Schéma pour une phase de tournoi
export const tournamentPhaseSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Le nom de la phase est requis"),
  type: phaseTypeSchema,
  matchType: matchTypeSchema,
  rounds: z.number().min(1).optional(), // Nombre de rondes pour les rondes suisses
  order: z.number().min(0), // Ordre de la phase dans le tournoi
  status: z.enum(['not-started', 'in-progress', 'completed']).default('not-started'),
});

// Schéma pour un résultat de match
export const matchResultSchema = z.object({
  matchId: z.string(),
  phaseId: z.string(),
  player1Id: z.string(),
  player2Id: z.string().nullable(), // null pour un BYE
  player1Score: z.number().min(0),
  player2Score: z.number().min(0),
  winnerId: z.string().optional(), // ID du gagnant
  round: z.number().min(1).optional(), // Numéro de ronde (pour les rondes suisses)
  bracketPosition: z.string().optional(), // Position dans le bracket (ex: "QF1", "SF1", "F")
  status: z.enum(['pending', 'in-progress', 'completed', 'disputed']).default('pending'),
  reportedBy: z.string().optional(), // ID du joueur qui a rapporté le résultat
  confirmedBy: z.string().optional(), // ID du joueur qui a confirmé le résultat
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// Schéma pour une annonce
export const announcementSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  message: z.string().min(1, "Le message de l'annonce est requis").max(1000, "Le message est trop long"),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
});

// Schéma pour les paramètres du portail d'événement
export const eventPortalSettingsSchema = z.object({
  eventId: z.string(),
  phases: z.array(tournamentPhaseSchema),
  currentPhaseId: z.string().optional(), // ID de la phase en cours
  matchesPerRound: z.number().min(1).optional(), // Nombre de matchs par ronde
  allowSelfReporting: z.boolean().default(true), // Les joueurs peuvent-ils rapporter leurs résultats ?
  requireConfirmation: z.boolean().default(false), // Les résultats doivent-ils être confirmés par l'adversaire ?
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// Schéma pour créer/modifier les paramètres
export const createPortalSettingsSchema = eventPortalSettingsSchema.omit({
  createdAt: true,
  updatedAt: true,
});

// Schéma pour créer une phase
export const createPhaseSchema = tournamentPhaseSchema.omit({
  id: true,
  status: true,
});

// Schéma pour créer/modifier un résultat de match
export const createMatchResultSchema = matchResultSchema.omit({
  createdAt: true,
  updatedAt: true,
  status: true,
  reportedBy: true,
  confirmedBy: true,
});

// Schéma pour rapporter un résultat (par un joueur)
export const reportMatchResultSchema = z.object({
  matchId: z.string(),
  player1Score: z.number().min(0),
  player2Score: z.number().min(0),
  winnerId: z.string().optional(),
});

// Schéma pour confirmer un résultat
export const confirmMatchResultSchema = z.object({
  matchId: z.string(),
});

// Schéma pour créer une annonce
export const createAnnouncementSchema = announcementSchema.omit({
  eventId: true,
  id: true,
  createdAt: true,
  createdBy: true,
});

// Schéma pour un participant invité (sans compte)
export const guestParticipantSchema = z.object({
  id: z.string(), // ID unique généré pour ce participant invité
  eventId: z.string(),
  type: z.enum(['guest', 'email']), // 'guest' = username seul, 'email' = compte créé par email
  username: z.string().min(1, "Le nom d'utilisateur est requis"),
  discriminator: z.string().optional(), // Pour les participants par email
  email: z.string().email().optional(), // Pour les participants par email
  userId: z.string().optional(), // ID utilisateur si un compte a été créé
  addedBy: z.string(), // ID du créateur qui a ajouté ce participant
  addedAt: z.string().datetime(),
});

// Schéma pour ajouter un participant
export const addParticipantSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('userTag'),
    userTag: z.string().min(1, "Le user tag est requis"), // Format: username#1234
  }),
  z.object({
    type: z.literal('email'),
    email: z.string().email("Email invalide"),
    username: z.string().min(1, "Le nom d'utilisateur est requis"),
  }),
  z.object({
    type: z.literal('guest'),
    username: z.string().min(1, "Le nom d'utilisateur est requis"),
  }),
]);

// Types TypeScript
export type PhaseType = z.infer<typeof phaseTypeSchema>;
export type MatchType = z.infer<typeof matchTypeSchema>;
export type TournamentPhase = z.infer<typeof tournamentPhaseSchema>;
export type MatchResult = z.infer<typeof matchResultSchema>;
export type Announcement = z.infer<typeof announcementSchema>;
export type EventPortalSettings = z.infer<typeof eventPortalSettingsSchema>;
export type CreatePortalSettings = z.infer<typeof createPortalSettingsSchema>;
export type CreatePhase = z.infer<typeof createPhaseSchema>;
export type CreateMatchResult = z.infer<typeof createMatchResultSchema>;
export type ReportMatchResult = z.infer<typeof reportMatchResultSchema>;
export type ConfirmMatchResult = z.infer<typeof confirmMatchResultSchema>;
export type CreateAnnouncement = z.infer<typeof createAnnouncementSchema>;
export type GuestParticipant = z.infer<typeof guestParticipantSchema>;
export type AddParticipant = z.infer<typeof addParticipantSchema>;
