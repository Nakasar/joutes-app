import { z } from "zod";
import { GENERIC_TIEBREAKERS, type TournamentTiebreaker } from "@/lib/types/Tournament";

export const tournamentPhaseTypeSchema = z.enum([
  "freeform",
  "swiss",
  "elimination",
  "bracket",
  "time-race",
]);
export const tournamentResultModeSchema = z.enum(["points", "selection"]);
export const tournamentScoringMethodSchema = z.enum(["fixed", "rank_offset"]);
export const tournamentEliminationSeedingSchema = z.enum(["standings", "random"]);
export const tournamentBracketSeedingSchema = z.enum(["opposite", "adjacent", "random"]);
export const tournamentSwissPairingSchema = z.enum(["ranked", "random-in-bracket"]);
export const tournamentPhasePacingSchema = z.enum(["live", "asynchronous"]);
export const tournamentDeadlineResolutionSchema = z.enum(["double-loss", "manual"]);

// Scénario du pool d'une phase. `id` est stable : la ronde qui l'a reçu le
// conserve même si l'organisateur renomme ou réordonne le pool ensuite.
export const tournamentScenarioSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1, "Le nom du scénario est requis").max(200),
  description: z.string().max(2000).optional(),
});

// Critère de départage : un critère générique, ou la statistique d'un preset
// (`stat:<clé>`). La liste des critères génériques est celle du domaine, jamais
// recopiée : un critère qu'on y ajoute est accepté sans toucher à ce schéma.
// Pour les statistiques, seule la forme est vérifiée ici ; le domaine sait seul
// lesquelles le preset de la phase relève réellement, et écarte les autres au
// moment de classer.
const GENERIC_TIEBREAKER_KEYS = new Set<string>(GENERIC_TIEBREAKERS);
const STAT_TIEBREAKER_PATTERN = /^stat:[A-Za-z0-9_-]{1,40}$/;
const tiebreakerSchema = z.custom<TournamentTiebreaker>(
  (value) =>
    typeof value === "string" &&
    (GENERIC_TIEBREAKER_KEYS.has(value) || STAT_TIEBREAKER_PATTERN.test(value)),
  { message: "Critère de départage inconnu" }
);

// Chaîne de départage d'une phase. Un tableau vide est un choix valide (aucun
// départage : les ex æquo le restent) ; un même critère ne peut pas y figurer
// deux fois, le second passage ne trancherait jamais rien.
export const tournamentTiebreakersSchema = z
  .array(tiebreakerSchema)
  .max(12)
  .refine((keys) => new Set(keys).size === keys.length, {
    message: "Un critère de départage ne peut apparaître qu'une fois",
  });

// Durée d'un intervalle : d'une heure à un an, ce qui couvre aussi bien une
// ronde jouée le soir même qu'une ligue de club étalée sur une saison.
const intervalHoursSchema = z.number().int().min(1).max(8760);

const fixedScoringSchema = z.object({
  win: z.number().int(),
  loss: z.number().int(),
  draw: z.number().int(),
});

// Informations pratiques. `startsAt` est reçu en ISO 8601 et converti en Date.
// À la création les champs sont simplement omis ; à la mise à jour, null les
// retire explicitement (une chaîne vide ne suffit pas à distinguer les deux).
const tournamentDetailsShape = {
  location: z.string().max(200).optional(),
  startsAt: z.coerce.date().optional(),
  capacity: z.number().int().min(1).max(100000).optional(),
};
const tournamentDetailsUpdateShape = {
  location: z.string().max(200).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  capacity: z.number().int().min(1).max(100000).nullable().optional(),
};

export const createTournamentSchema = z.object({
  name: z.string().min(1, "Le nom du tournoi est requis").max(200),
  eventId: z.string().optional(),
  // Ligue POINTS alimentée par ce tournoi à sa clôture.
  leagueId: z.string().min(1).optional(),
  gameId: z.string().optional(),
  // Jeu hors catalogue, saisi à la main. Sans effet si `gameId` est fourni.
  customGameName: z.string().min(1).max(200).optional(),
  ...tournamentDetailsShape,
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
  // null = retirer le jeu associé au tournoi (la chaîne vide est refusée).
  gameId: z.string().min(1).nullable().optional(),
  // null = retirer le nom de jeu saisi à la main.
  customGameName: z.string().min(1).max(200).nullable().optional(),
  // null = détacher le tournoi de son événement (la chaîne vide est refusée).
  eventId: z.string().min(1).nullable().optional(),
  // null = détacher le tournoi de sa ligue, ce qui retire aussi les points
  // qu'il lui avait apportés.
  leagueId: z.string().min(1).nullable().optional(),
  currentPhaseId: z.string().nullable().optional(),
  // Panneau montré sur l'écran de projection de la salle.
  liveDisplay: z.enum(["timer", "announcements", "standings", "matches"]).optional(),
  ...tournamentDetailsUpdateShape,
  settings: z
    .object({
      allowSelfReporting: z.boolean(),
      requireConfirmation: z.boolean(),
      preRegistration: z.boolean(),
      firstTableNumber: z.number().int().min(0).max(9999),
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

// Contrôle du chronomètre d'une phase puzzle : il part toujours de 0, il n'y a
// donc pas de durée à fournir. `reset` le remet à zéro et l'arrête.
export const stopwatchActionSchema = z.object({
  action: z.enum(["start", "pause", "resume", "reset"]),
});

// Un temps de puzzle : jusqu'à 24 h, exprimé en secondes entières. La seconde
// est la granularité de tout ce qui est affiché en salle.
const puzzleDurationSecondsSchema = z.number().int().min(0).max(86400);

// Relevé d'un temps de puzzle. `durationSeconds` absent = le temps courant du
// chronomètre du tournoi, ce qui est le geste normal (« il vient de finir »).
// `playerId` est réservé à l'organisation : un joueur ne se rapporte que
// lui-même, et le domaine le lui impose.
export const recordPuzzleResultSchema = z.object({
  playerId: z.string().min(1).optional(),
  durationSeconds: puzzleDurationSecondsSchema.optional(),
});

// Correction d'un temps déjà relevé (organisation).
export const updatePuzzleResultSchema = z.object({
  durationSeconds: puzzleDurationSecondsSchema,
});

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

// Ajout d'un membre du staff : email ou tag username#0000, et rôle.
export const addTournamentStaffSchema = z.object({
  identifier: z.string().min(1, "Un identifiant est requis").max(150),
  role: z.enum(["organizer", "judge"]),
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
  // Table fixe du joueur, conservée pendant tout le tournoi (null = retirer).
  fixedTableNumber: z.number().int().min(0).max(9999).nullable().optional(),
  status: z.enum(["registered", "pre-registered", "dropped"]).optional(),
  // Pointage à l'arrivée : true marque le joueur présent, false annule le
  // pointage. Indépendant du statut d'inscription.
  checkedIn: z.boolean().optional(),
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
    bracketSeeding: tournamentBracketSeedingSchema.default("opposite"),
    swissPairing: tournamentSwissPairingSchema.default("ranked"),
    pacing: tournamentPhasePacingSchema.default("live"),
    intervalHours: intervalHoursSchema.optional(),
    deadlineResolution: tournamentDeadlineResolutionSchema.default("double-loss"),
    statsPresetKey: z.string().min(1).max(60).optional(),
    // Départages appliqués après les points de match, dans cet ordre. Omis = la
    // phase suit ceux du jeu (preset) ou la chaîne historique.
    tiebreakers: tournamentTiebreakersSchema.optional(),
    // Saisie des statistiques du preset exigée pour rapporter un résultat.
    requireMatchStats: z.boolean().default(false),
    scenarios: z.array(tournamentScenarioSchema).max(50).optional(),
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
  })
  .refine((v) => v.pacing !== "asynchronous" || v.intervalHours !== undefined, {
    message: "La durée d'un intervalle est requise pour une phase asynchrone",
    path: ["intervalHours"],
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
    bracketSeeding: tournamentBracketSeedingSchema.optional(),
    swissPairing: tournamentSwissPairingSchema.optional(),
    pacing: tournamentPhasePacingSchema.optional(),
    intervalHours: intervalHoursSchema.optional(),
    deadlineResolution: tournamentDeadlineResolutionSchema.optional(),
    // null retire le preset : la phase ne relève plus de statistiques et
    // retombe sur les départages historiques.
    statsPresetKey: z.string().min(1).max(60).nullable().optional(),
    // null rend la phase aux départages de son preset (ou à la chaîne
    // historique) : c'est le geste « je reprends les règles du jeu ».
    tiebreakers: tournamentTiebreakersSchema.nullable().optional(),
    requireMatchStats: z.boolean().optional(),
    // null vide le pool de scénarios (les rondes déjà créées gardent le leur).
    scenarios: z.array(tournamentScenarioSchema).max(50).nullable().optional(),
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
          // Statistiques secondaires de la partie : joueur → clé de statistique
          // → valeur. Les clés autorisées dépendent du preset de la phase, que
          // seul le domaine connaît : la validation fine est faite là-bas.
          stats: z
            .record(z.string(), z.record(z.string(), z.number().int().min(0).max(9999)))
            .optional(),
        })
        .refine((g) => g.winnerId !== undefined || g.points !== undefined, {
          message: "Chaque partie doit renseigner un vainqueur (ou nul) ou des points",
        })
    )
    .min(1, "Au moins une partie doit être renseignée")
    .max(9),
});

// Forfait prononcé par l'arbitrage : `winnerId` désigne le joueur qui l'emporte
// sans avoir joué, null fait perdre les deux (intervalle expiré sans partie).
export const forfeitTournamentMatchSchema = z.object({
  action: z.literal("forfeit"),
  winnerId: z.string().min(1).nullable(),
});

export const confirmTournamentMatchSchema = z.object({
  action: z.literal("confirm"),
});

export const disputeTournamentMatchSchema = z.object({
  action: z.literal("dispute"),
});

// Suppression d'un résultat rapporté (organisateur) : réinitialise le match.
export const clearTournamentMatchSchema = z.object({
  action: z.literal("clear"),
});

// Modification manuelle du numéro de table (gestionnaires ; null = retirer).
export const setTableTournamentMatchSchema = z.object({
  action: z.literal("set-table"),
  tableNumber: z.number().int().min(0).max(9999).nullable(),
});

// Prolongation accordée à une table. `seconds` s'ajoute à la prolongation en
// cours (valeur négative pour la réduire) ; 0 la retire entièrement.
export const extendTournamentMatchSchema = z.object({
  action: z.literal("extend"),
  seconds: z.number().int().min(-7200).max(7200),
});

export const updateTournamentMatchSchema = z.discriminatedUnion("action", [
  reportTournamentMatchSchema,
  confirmTournamentMatchSchema,
  disputeTournamentMatchSchema,
  clearTournamentMatchSchema,
  setTableTournamentMatchSchema,
  extendTournamentMatchSchema,
  forfeitTournamentMatchSchema,
]);

export const tournamentPenaltyTypeSchema = z.enum([
  "warning",
  "game-loss",
  "match-loss",
  "disqualification",
]);

export const createTournamentPenaltySchema = z.object({
  type: tournamentPenaltyTypeSchema,
  reason: z.string().max(300).optional(),
});

export const createTournamentNoteSchema = z.object({
  content: z.string().min(1, "La note ne peut pas être vide").max(2000),
});

// Haut fait attribué pendant un tournoi rattaché. `featId` est validé contre le
// catalogue de la ligue par la route : le schéma ne connaît pas les ligues.
export const createTournamentFeatAwardSchema = z.object({
  featId: z.string().min(1).max(64),
  matchId: z.string().min(1).optional(),
});

// Liste de deck : `content` remplace la liste, `checked` bascule la vérification
// par l'arbitrage. Les deux sont indépendants (au moins un est requis).
export const updateTournamentDecklistSchema = z
  .object({
    content: z.string().max(20000).optional(),
    checked: z.boolean().optional(),
  })
  .refine((v) => v.content !== undefined || v.checked !== undefined, {
    message: "Renseignez la liste ou son état de vérification",
  });

// ── Formulaire d'inscription ────────────────────────────────────────────────

export const tournamentFormFieldTypeSchema = z.enum([
  "text",
  "long-text",
  "number",
  "single-choice",
  "multiple-choice",
  "decklist",
  "card",
]);

const CHOICE_TYPES = ["single-choice", "multiple-choice"] as const;

export const tournamentFormFieldSchema = z
  .object({
    // Absent à la création d'un champ : le domaine en génère un.
    id: z.string().min(1).max(40).optional(),
    type: tournamentFormFieldTypeSchema,
    label: z.string().min(1, "Le libellé de la question est requis").max(200),
    description: z.string().max(500).optional(),
    required: z.boolean().default(false),
    options: z.array(z.string().min(1).max(200)).max(50).optional(),
  })
  .refine((field) => !CHOICE_TYPES.includes(field.type as (typeof CHOICE_TYPES)[number]) || (field.options?.length ?? 0) >= 1, {
    message: "Une question à choix doit proposer au moins une option",
    path: ["options"],
  });

export const updateTournamentFormSchema = z.object({
  fields: z.array(tournamentFormFieldSchema).max(50),
  playerEditable: z.boolean().default(true),
  // null retire la date limite (une chaîne vide ne suffit pas à distinguer
  // « pas de limite » de « champ non envoyé »).
  closesAt: z.coerce.date().nullable().optional(),
  // Réponses tardives acceptées une fois la saisie normale close.
  lateSubmissions: z.boolean().default(false),
});

// Réponse à un champ. Le type du champ décide de la clé attendue ; la
// cohérence est vérifiée côté domaine, qui seul connaît le formulaire.
export const tournamentFormAnswerSchema = z.object({
  fieldId: z.string().min(1).max(40),
  text: z.string().max(5000).optional(),
  number: z.number().optional(),
  choices: z.array(z.string().max(200)).max(50).optional(),
  card: z
    .object({
      cardId: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
      image: z.string().max(500).optional(),
      setCode: z.string().max(20).optional(),
      collectorNumber: z.string().max(20).optional(),
    })
    .optional(),
  // Saisie brute d'une liste de deck : texte, lien ou code. L'analyse est
  // refaite côté serveur, jamais reprise du client.
  decklist: z.string().max(20000).optional(),
});

export const submitTournamentFormSchema = z.object({
  answers: z.array(tournamentFormAnswerSchema).max(50),
});

// Actions sur une ronde :
// - reopen : repasse la ronde « en cours » (ronde courante).
// - set-deadline : déplace l'échéance de l'intervalle (null la retire).
// - set-scenario : change le scénario joué (null le retire).
// - close-deadline : clôt l'intervalle en appliquant la règle de la phase aux
//   matchs restés sans résultat.
export const updateTournamentRoundSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reopen") }),
  z.object({
    action: z.literal("set-deadline"),
    deadlineAt: z.coerce.date().nullable(),
  }),
  z.object({
    action: z.literal("set-scenario"),
    scenario: tournamentScenarioSchema.nullable(),
  }),
  z.object({ action: z.literal("close-deadline") }),
]);

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
export type AddTournamentPlayerInput = z.infer<typeof addTournamentPlayerSchema>;
export type UpdateTournamentPlayerInput = z.infer<typeof updateTournamentPlayerSchema>;
export type CreateTournamentPhaseInput = z.infer<typeof createTournamentPhaseSchema>;
export type UpdateTournamentPhaseInput = z.infer<typeof updateTournamentPhaseSchema>;
export type CreateTournamentMatchInput = z.infer<typeof createTournamentMatchSchema>;
export type UpdateTournamentMatchInput = z.infer<typeof updateTournamentMatchSchema>;
export type UpdateTournamentRoundInput = z.infer<typeof updateTournamentRoundSchema>;
export type JoinTournamentInput = z.infer<typeof joinTournamentSchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type TimerActionInput = z.infer<typeof timerActionSchema>;
export type StopwatchActionInput = z.infer<typeof stopwatchActionSchema>;
export type RecordPuzzleResultInput = z.infer<typeof recordPuzzleResultSchema>;
export type UpdatePuzzleResultInput = z.infer<typeof updatePuzzleResultSchema>;
export type CreateTournamentPenaltyInput = z.infer<typeof createTournamentPenaltySchema>;
export type CreateTournamentNoteInput = z.infer<typeof createTournamentNoteSchema>;
export type UpdateTournamentDecklistInput = z.infer<typeof updateTournamentDecklistSchema>;
export type TournamentFormFieldInput = z.infer<typeof tournamentFormFieldSchema>;
export type UpdateTournamentFormInput = z.infer<typeof updateTournamentFormSchema>;
export type TournamentFormAnswerInput = z.infer<typeof tournamentFormAnswerSchema>;
export type SubmitTournamentFormInput = z.infer<typeof submitTournamentFormSchema>;
