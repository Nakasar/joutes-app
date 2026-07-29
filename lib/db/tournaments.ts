import 'server-only';

import crypto from "crypto";
import { DateTime } from "luxon";
import { customAlphabet } from "nanoid";
import db from "@/lib/mongodb";
import { ObjectId, WithId } from "mongodb";
import {
  DEFAULT_FIXED_SCORING,
  DEFAULT_INTERVAL_HOURS,
  DEFAULT_RANK_OFFSETS,
  Tournament,
  TournamentActivity,
  TournamentActivityDb,
  TournamentActivityType,
  TournamentAnnouncement,
  TournamentAnnouncementDb,
  TournamentAnnouncementLevel,
  TournamentBracketSeeding,
  TournamentDb,
  TournamentDeadlineResolution,
  TournamentDecklist,
  TournamentEliminationSeeding,
  TournamentFixedScoring,
  TournamentForm,
  TournamentFormAnswer,
  TournamentFormField,
  TournamentGameResult,
  TournamentMatch,
  TournamentMatchDb,
  TournamentMatchPlayer,
  TournamentNote,
  TournamentNoteDb,
  TournamentPenalty,
  TournamentPenaltyDb,
  TournamentPenaltyType,
  TournamentPhase,
  TournamentPhaseDb,
  TournamentPhasePacing,
  TournamentPhaseType,
  TournamentPlayerStatus,
  TournamentPlayer,
  TournamentPlayerDb,
  TournamentResultMode,
  TournamentRound,
  TournamentRoundDb,
  TournamentRoundStanding,
  TournamentScenario,
  TournamentScoringMethod,
  TournamentSwissPairing,
} from "@/lib/types/Tournament";
import {
  PairingMatch,
  PairingResult,
  PlayerStanding,
  chunkIntoPods,
  generateBracketPosition,
  generateEliminationBracket,
  generateNextBracketRound,
  generateSwissPairings,
  shuffleArray,
} from "@/lib/utils/pairing";
import { type GameTournamentPreset, getPreset, presetStatKeys } from "@/lib/tournaments/game-presets";
import {
  DEFAULT_MATCH_SCORING,
  calculateMultiplayerStandings,
  scoringForPhase,
} from "@/lib/tournaments/standings";
import {
  resolveCurrentRound,
  resolveDisplayPhase,
} from "@/lib/tournaments/current-round";
import { parseDecklistAnswer } from "@/lib/tournaments/decklist-parsing";
import {
  createInvitedUserByEmail,
  getUserByEmail,
  getUserById,
  getUserByUsernameAndDiscriminator,
  getUserDiscriminator,
} from "@/lib/db/users";

// Validation d'email volontairement simple : le but est de distinguer un
// email d'un nom d'utilisateur, pas de valider strictement l'adresse.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TOURNAMENTS = "tournaments";
const PLAYERS = "tournament-players";
const PHASES = "tournament-phases";
const ROUNDS = "tournament-rounds";
const MATCHES = "tournament-matches";
const ANNOUNCEMENTS = "tournament-announcements";
const PENALTIES = "tournament-penalties";
const NOTES = "tournament-notes";
const ACTIVITY = "tournament-activity";

// Nombre d'événements conservés dans le journal d'activité d'un tournoi. Les
// plus anciens sont purgés à l'écriture : le journal est un fil de suivi en
// direct, pas un historique exhaustif.
const ACTIVITY_KEEP = 200;

// Code de participation : 9 caractères alphanumériques majuscules (nanoid).
const joinCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const generateJoinCodeValue = customAlphabet(joinCodeAlphabet, 9);

// Code de l'écran de salle : 6 caractères, sur le même alphabet. La longueur
// diffère volontairement de celle du code de participation — les deux se
// résolvent depuis /t/:code, et deux longueurs disjointes garantissent qu'un
// code ne peut jamais désigner les deux à la fois, sans arbitrage à écrire.
// Plus court aussi parce qu'il se tape sur la machine du vidéoprojecteur.
const generateLiveCodeValue = customAlphabet(joinCodeAlphabet, 6);

// Index unique (phase, numéro de ronde) : deux créations de ronde
// concurrentes ne peuvent pas produire deux rondes portant le même numéro
// dans une phase — la seconde échoue sur duplicate key (E11000), transformé
// en erreur de conflit dans createNextRound. createIndex est idempotent ;
// l'échec (ex: base indisponible au chargement) n'est pas bloquant, la
// création de ronde reste alors possible sans cette protection.
const roundsIndexReady = db
  .collection(ROUNDS)
  .createIndex({ phaseId: 1, number: 1 }, { unique: true })
  .catch((error) => {
    console.error("Impossible de créer l'index unique des rondes de tournoi:", error);
  });

// Index unique partiel : un code de participation ne peut être partagé par deux
// tournois non terminés (à venir / en cours). Best-effort : un échec (base
// indisponible, opérateur non supporté par la version) n'est pas bloquant —
// generateUniqueJoinCode vérifie de toute façon l'unicité avant écriture, et
// les E11000 concurrents sont gérés par un ré-essai.
const joinCodeIndexReady = db
  .collection(TOURNAMENTS)
  .createIndex(
    { joinCode: 1 },
    {
      unique: true,
      partialFilterExpression: {
        joinCode: { $exists: true },
        status: { $in: ["draft", "in-progress"] },
      },
    }
  )
  .catch((error) => {
    console.error("Impossible de créer l'index unique du code de participation:", error);
  });

// Même garantie pour le code de l'écran de salle, sur les mêmes bases.
const liveCodeIndexReady = db
  .collection(TOURNAMENTS)
  .createIndex(
    { liveCode: 1 },
    {
      unique: true,
      partialFilterExpression: {
        liveCode: { $exists: true },
        status: { $in: ["draft", "in-progress"] },
      },
    }
  )
  .catch((error) => {
    console.error("Impossible de créer l'index unique du code d'écran:", error);
  });

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

// Domain errors carry a stable code so API routes can map them to HTTP statuses
// without string-matching French messages.
export class TournamentError extends Error {
  constructor(
    public code: "not-found" | "forbidden" | "conflict" | "invalid",
    message: string
  ) {
    super(message);
    this.name = "TournamentError";
  }
}

function toTournament(doc: WithId<TournamentDb>): Tournament {
  return {
    id: doc._id.toString(),
    name: doc.name,
    eventId: doc.eventId,
    gameId: doc.gameId,
    status: doc.status,
    currentPhaseId: doc.currentPhaseId,
    joinCode: doc.joinCode,
    liveCode: doc.liveCode,
    timer: doc.timer,
    liveDisplay: doc.liveDisplay,
    location: doc.location,
    startsAt: doc.startsAt,
    capacity: doc.capacity,
    settings: {
      allowSelfReporting: doc.settings.allowSelfReporting,
      requireConfirmation: doc.settings.requireConfirmation,
      // Défaut pour les tournois créés avant l'ajout du mode pré-inscription.
      preRegistration: doc.settings.preRegistration ?? false,
      firstTableNumber: doc.settings.firstTableNumber,
    },
    createdBy: doc.createdBy,
    organizerIds: doc.organizerIds,
    // Défaut pour les tournois créés avant l'introduction des arbitres.
    judgeIds: doc.judgeIds ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    // Défauts pour les formulaires enregistrés avant l'ajout d'un réglage :
    // le document en base peut être plus ancien que le type.
    registrationForm: doc.registrationForm && {
      ...doc.registrationForm,
      playerEditable: doc.registrationForm.playerEditable ?? true,
      lateSubmissions: doc.registrationForm.lateSubmissions ?? false,
    },
  };
}

function toPlayer(doc: WithId<TournamentPlayerDb>): TournamentPlayer {
  return {
    id: doc._id.toString(),
    tournamentId: doc.tournamentId.toString(),
    userId: doc.userId,
    displayName: doc.displayName,
    discriminator: doc.discriminator,
    seed: doc.seed,
    fixedTableNumber: doc.fixedTableNumber,
    // Statuts connus conservés ; l'ancienne valeur "active" (avant renommage)
    // et toute valeur inattendue sont normalisées en "registered".
    status:
      doc.status === "dropped" || doc.status === "pre-registered" ? doc.status : "registered",
    checkedInAt: doc.checkedInAt,
    decklist: doc.decklist,
    formAnswers: doc.formAnswers,
    syncKey: doc.syncKey,
    addedBy: doc.addedBy,
    createdAt: doc.createdAt,
  };
}

// Retire d'un joueur ce qui ne doit pas sortir vers un non-organisateur : le
// secret de synchronisation, et les réponses au formulaire d'inscription
// (privées — un joueur ne voit que les siennes, servies par la route dédiée).
export function sanitizePlayer(
  player: TournamentPlayer
): Omit<TournamentPlayer, "syncKey" | "formAnswers"> {
  const { syncKey: _syncKey, formAnswers: _formAnswers, ...rest } = player;
  return rest;
}

// Convertit l'ancien champ matchFormat (BO1..BO5) en best-of-n pour les phases
// créées avant l'introduction de bestOf.
function legacyMatchFormatToBestOf(matchFormat: unknown): number | undefined {
  if (typeof matchFormat !== "string") return undefined;
  const map: Record<string, number> = { BO1: 1, BO2: 2, BO3: 3, BO5: 5 };
  return map[matchFormat];
}

function toPhase(doc: WithId<TournamentPhaseDb> & { matchFormat?: string }): TournamentPhase {
  return {
    id: doc._id.toString(),
    tournamentId: doc.tournamentId.toString(),
    name: doc.name,
    type: doc.type,
    // Défauts pour les phases créées avant l'ajout de ces champs.
    bestOf: doc.bestOf ?? legacyMatchFormatToBestOf(doc.matchFormat) ?? 1,
    resultMode: doc.resultMode ?? "selection",
    scoringMethod: doc.scoringMethod ?? "fixed",
    fixedScoring: doc.fixedScoring ?? DEFAULT_FIXED_SCORING,
    rankOffsets: doc.rankOffsets ?? DEFAULT_RANK_OFFSETS,
    eliminationSeeding: doc.eliminationSeeding ?? "standings",
    bracketSeeding: doc.bracketSeeding ?? "opposite",
    swissPairing: doc.swissPairing ?? "ranked",
    pacing: doc.pacing ?? "live",
    intervalHours: doc.intervalHours ?? DEFAULT_INTERVAL_HOURS,
    deadlineResolution: doc.deadlineResolution ?? "double-loss",
    statsPresetKey: doc.statsPresetKey,
    scenarios: doc.scenarios,
    plannedRounds: doc.plannedRounds,
    topCut: doc.topCut,
    minPlayersPerMatch: doc.minPlayersPerMatch ?? 2,
    maxPlayersPerMatch: doc.maxPlayersPerMatch ?? 2,
    order: doc.order,
    status: doc.status,
    entryDroppedPlayerIds: doc.entryDroppedPlayerIds,
    createdAt: doc.createdAt,
  };
}

function toRound(doc: WithId<TournamentRoundDb>): TournamentRound {
  return {
    id: doc._id.toString(),
    tournamentId: doc.tournamentId.toString(),
    phaseId: doc.phaseId.toString(),
    number: doc.number,
    status: doc.status,
    standings: doc.standings,
    standingsValidatedAt: doc.standingsValidatedAt,
    opensAt: doc.opensAt,
    deadlineAt: doc.deadlineAt,
    remindersSentAt: doc.remindersSentAt,
    scenario: doc.scenario,
    createdAt: doc.createdAt,
    completedAt: doc.completedAt,
  };
}

function toMatch(doc: WithId<TournamentMatchDb>): TournamentMatch {
  return {
    id: doc._id.toString(),
    tournamentId: doc.tournamentId.toString(),
    phaseId: doc.phaseId.toString(),
    roundId: doc.roundId.toString(),
    players: doc.players,
    games: doc.games ?? [],
    winnerIds: doc.winnerIds ?? [],
    resolution: doc.resolution ?? "played",
    bracketPosition: doc.bracketPosition,
    tableNumber: doc.tableNumber,
    extensionSeconds: doc.extensionSeconds,
    status: doc.status,
    reportedBy: doc.reportedBy,
    confirmedBy: doc.confirmedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Vue 2-joueurs d'un match, pour la génération de pairings (les phases
// swiss/bracket ne produisent que des matchs à 1 ou 2 joueurs — un seul
// joueur étant un BYE). Refuse les matchs multijoueurs plutôt que de les
// tronquer silencieusement, ce qui fausserait pairings et classements.
function toPairingMatch(match: TournamentMatch): PairingMatch {
  if (match.players.length > 2) {
    throw new TournamentError(
      "conflict",
      "Cette phase contient des matchs multijoueurs, incompatibles avec la génération de pairings 2 joueurs"
    );
  }
  if (match.players.length === 0) {
    // Un match sans joueur est un document corrompu : mieux vaut échouer
    // explicitement que de fausser silencieusement pairings et classements.
    throw new TournamentError("conflict", `Le match ${match.id} ne contient aucun joueur`);
  }
  const [p1, p2] = match.players;
  return {
    matchId: match.id,
    player1Id: p1?.playerId ?? "",
    player2Id: p2?.playerId ?? null,
    player1Score: p1?.score ?? 0,
    player2Score: p2?.score ?? 0,
    winnerId: match.winnerIds[0] ?? null,
    status: match.status,
    bracketPosition: match.bracketPosition,
  };
}

function parseObjectId(id: string, resource: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new TournamentError("not-found", `${resource} non trouvé`);
  }
  return new ObjectId(id);
}

// Nombre de parties à gagner pour remporter un best-of-n.
function winsNeeded(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

// Parties créditées au joueur unique d'un BYE (victoire nette du best-of).
function byeWinScore(bestOf: number): number {
  return winsNeeded(bestOf);
}

// Déduit, d'une liste de parties, le vainqueur de chaque partie (mode points :
// score le plus élevé, égalité = nulle) et le nombre de parties gagnées par
// chaque joueur du match.
function tallyGames(
  games: TournamentGameResult[],
  matchPlayerIds: string[],
  resultMode: TournamentResultMode,
  statKeys: string[] = []
): { normalizedGames: TournamentGameResult[]; gamesWonByPlayer: Map<string, number> } {
  const gamesWonByPlayer = new Map<string, number>(matchPlayerIds.map((id) => [id, 0]));

  // Statistiques secondaires d'une partie, réduites aux joueurs du match et aux
  // clés du preset. Absentes = la phase n'en relève pas, ou rien n'a été saisi.
  const normalizeStats = (
    stats: Record<string, Record<string, number>> | undefined
  ): Record<string, Record<string, number>> | undefined => {
    if (statKeys.length === 0 || !stats) return undefined;
    const normalized: Record<string, Record<string, number>> = {};
    for (const playerId of matchPlayerIds) {
      const playerStats = stats[playerId];
      if (!playerStats) continue;
      normalized[playerId] = Object.fromEntries(
        statKeys.map((key) => [key, playerStats[key] ?? 0])
      );
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  };

  const normalizedGames: TournamentGameResult[] = games.map((game) => {
    let winnerId: string | null | undefined = game.winnerId ?? null;
    const stats = normalizeStats(game.stats);

    if (resultMode === "points") {
      const points = game.points ?? {};
      let best = -Infinity;
      let leaders: string[] = [];
      for (const playerId of matchPlayerIds) {
        const value = points[playerId] ?? 0;
        if (value > best) {
          best = value;
          leaders = [playerId];
        } else if (value === best) {
          leaders.push(playerId);
        }
      }
      // Un seul leader = vainqueur ; égalité en tête = partie nulle.
      winnerId = leaders.length === 1 ? leaders[0] : null;
      const normalizedPoints: Record<string, number> = {};
      for (const playerId of matchPlayerIds) normalizedPoints[playerId] = points[playerId] ?? 0;
      const won = winnerId;
      if (won) gamesWonByPlayer.set(won, (gamesWonByPlayer.get(won) ?? 0) + 1);
      return { winnerId, points: normalizedPoints, ...(stats ? { stats } : {}) };
    }

    if (winnerId) {
      gamesWonByPlayer.set(winnerId, (gamesWonByPlayer.get(winnerId) ?? 0) + 1);
    }
    return { winnerId: winnerId ?? null, ...(stats ? { stats } : {}) };
  });

  return { normalizedGames, gamesWonByPlayer };
}

// =====================
// TOURNAMENT
// =====================

// Génère un code de participation unique parmi les tournois non terminés
// (à venir et en cours). L'espace (36^9) rend les collisions négligeables ;
// on réessaie néanmoins quelques fois par sécurité.
async function generateUniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateJoinCodeValue();
    const clash = await db
      .collection<TournamentDb>(TOURNAMENTS)
      .findOne({ joinCode: code, status: { $ne: "completed" } });
    if (!clash) return code;
  }
  throw new TournamentError("conflict", "Impossible de générer un code de participation unique");
}

// Code d'écran unique parmi les tournois non terminés. L'espace est plus petit
// que celui du code de participation (36^6 ≈ 2,2 milliards) : la vérification
// avant écriture compte donc davantage, et l'index tranche les concurrents.
async function generateUniqueLiveCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateLiveCodeValue();
    const clash = await db
      .collection<TournamentDb>(TOURNAMENTS)
      .findOne({ liveCode: code, status: { $ne: "completed" } });
    if (!clash) return code;
  }
  throw new TournamentError("conflict", "Impossible de générer un code d'écran unique");
}

export async function createTournament(data: {
  name: string;
  eventId?: string;
  gameId?: string;
  location?: string;
  startsAt?: Date;
  capacity?: number;
  settings: { allowSelfReporting: boolean; requireConfirmation: boolean; preRegistration: boolean };
  createdBy: string;
}): Promise<Tournament> {
  await Promise.all([joinCodeIndexReady, liveCodeIndexReady]);
  // Ré-essaie sur une collision de code (E11000) contre l'index unique partiel :
  // en pratique quasi impossible, mais garantit l'unicité même en concurrence.
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc: TournamentDb = {
      name: data.name,
      eventId: data.eventId,
      gameId: data.gameId,
      location: data.location,
      startsAt: data.startsAt,
      capacity: data.capacity,
      status: "draft",
      joinCode: await generateUniqueJoinCode(),
      liveCode: await generateUniqueLiveCode(),
      settings: data.settings,
      createdBy: data.createdBy,
      organizerIds: [data.createdBy],
      judgeIds: [],
      createdAt: new Date(),
    };
    try {
      const result = await db.collection<TournamentDb>(TOURNAMENTS).insertOne(doc);
      return toTournament({ ...doc, _id: result.insertedId });
    } catch (error) {
      if (isDuplicateKeyError(error)) continue;
      throw error;
    }
  }
  throw new TournamentError("conflict", "Impossible de générer un code de participation unique");
}

// Renvoie le tournoi portant ce code de participation, en préférant un tournoi
// non terminé (le code n'est unique que parmi ceux-là). Recherche en 2 temps
// pour éviter de charger d'éventuels doublons ; normalise la casse.
export async function getTournamentByJoinCode(code: string): Promise<Tournament | null> {
  const joinCode = code.trim().toUpperCase();
  const coll = db.collection<TournamentDb>(TOURNAMENTS);
  const active = await coll.findOne({ joinCode, status: { $ne: "completed" } });
  if (active) return toTournament(active);
  const any = await coll.findOne({ joinCode });
  return any ? toTournament(any) : null;
}

// Garantit qu'un tournoi possède un code de participation (génère et persiste
// s'il n'en a pas encore — cas des tournois créés avant cette fonctionnalité).
export async function ensureJoinCode(tournamentId: string): Promise<string> {
  const _id = parseObjectId(tournamentId, "Tournoi");
  const coll = db.collection<TournamentDb>(TOURNAMENTS);
  const doc = await coll.findOne({ _id });
  if (!doc) throw new TournamentError("not-found", "Tournoi non trouvé");
  if (doc.joinCode) return doc.joinCode;

  await joinCodeIndexReady;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await generateUniqueJoinCode();
    try {
      // Update conditionnel : ne pose le code que s'il est encore absent (évite
      // d'écraser un code posé par un appel concurrent).
      const updated = await coll.findOneAndUpdate(
        { _id, joinCode: { $exists: false } },
        { $set: { joinCode: code } },
        { returnDocument: "after" }
      );
      if (updated?.joinCode) return updated.joinCode;
      // Un appel concurrent a déjà posé un code : on le relit.
      const fresh = await coll.findOne({ _id });
      if (fresh?.joinCode) return fresh.joinCode;
    } catch (error) {
      if (isDuplicateKeyError(error)) continue;
      throw error;
    }
  }
  throw new TournamentError("conflict", "Impossible de générer un code de participation unique");
}

// Tournoi portant ce code d'écran, en préférant un tournoi non terminé (le code
// n'est unique que parmi ceux-là). Même forme que la résolution du code de
// participation, dont il partage l'alphabet mais pas la longueur.
export async function getTournamentByLiveCode(code: string): Promise<Tournament | null> {
  const liveCode = code.trim().toUpperCase();
  const coll = db.collection<TournamentDb>(TOURNAMENTS);
  const active = await coll.findOne({ liveCode, status: { $ne: "completed" } });
  if (active) return toTournament(active);
  const any = await coll.findOne({ liveCode });
  return any ? toTournament(any) : null;
}

// Garantit qu'un tournoi possède un code d'écran (génère et persiste s'il n'en
// a pas encore — cas des tournois créés avant cette fonctionnalité).
export async function ensureLiveCode(tournamentId: string): Promise<string> {
  const _id = parseObjectId(tournamentId, "Tournoi");
  const coll = db.collection<TournamentDb>(TOURNAMENTS);
  const doc = await coll.findOne({ _id });
  if (!doc) throw new TournamentError("not-found", "Tournoi non trouvé");
  if (doc.liveCode) return doc.liveCode;

  await liveCodeIndexReady;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await generateUniqueLiveCode();
    try {
      // Update conditionnel : ne pose le code que s'il est encore absent (évite
      // d'écraser un code posé par un appel concurrent).
      const updated = await coll.findOneAndUpdate(
        { _id, liveCode: { $exists: false } },
        { $set: { liveCode: code } },
        { returnDocument: "after" }
      );
      if (updated?.liveCode) return updated.liveCode;
      // Un appel concurrent a déjà posé un code : on le relit.
      const fresh = await coll.findOne({ _id });
      if (fresh?.liveCode) return fresh.liveCode;
    } catch (error) {
      if (isDuplicateKeyError(error)) continue;
      throw error;
    }
  }
  throw new TournamentError("conflict", "Impossible de générer un code d'écran unique");
}

export async function getTournamentById(tournamentId: string): Promise<Tournament | null> {
  if (!ObjectId.isValid(tournamentId)) return null;
  const doc = await db.collection<TournamentDb>(TOURNAMENTS).findOne({ _id: new ObjectId(tournamentId) });
  return doc ? toTournament(doc) : null;
}

export async function listTournamentsForUser(userId: string): Promise<Tournament[]> {
  const docs = await db
    .collection<TournamentDb>(TOURNAMENTS)
    .find({ organizerIds: userId })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(toTournament);
}

export type TournamentListSummary = {
  playersCount: number;
  phases: { type: TournamentPhaseType; plannedRounds?: number; topCut?: number }[];
  currentRound: {
    id: string;
    number: number;
    plannedRounds?: number;
    reportedMatches: number;
    totalMatches: number;
  } | null;
};

/**
 * Résumés d'avancement pour une liste de tournois (participants, format, ronde
 * en cours). Volontairement en lot : la liste des tournois d'un organisateur
 * peut être longue, et un aller-retour par tournoi ferait un N+1. Ici le coût
 * reste de quatre requêtes quel que soit le nombre de tournois.
 */
export async function listTournamentSummaries(
  tournaments: Tournament[]
): Promise<Map<string, TournamentListSummary>> {
  const summaries = new Map<string, TournamentListSummary>();
  if (tournaments.length === 0) return summaries;

  const ids = tournaments.map((t) => new ObjectId(t.id));

  const [playerCounts, phaseDocs, roundDocs] = await Promise.all([
    db
      .collection<TournamentPlayerDb>(PLAYERS)
      .aggregate<{ _id: ObjectId; count: number }>([
        { $match: { tournamentId: { $in: ids }, status: { $ne: "dropped" } } },
        { $group: { _id: "$tournamentId", count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection<TournamentPhaseDb>(PHASES)
      .find({ tournamentId: { $in: ids } })
      .sort({ order: 1, createdAt: 1 })
      .toArray(),
    db
      .collection<TournamentRoundDb>(ROUNDS)
      .find({ tournamentId: { $in: ids } })
      .sort({ createdAt: 1 })
      .toArray(),
  ]);

  const playersByTournament = new Map(playerCounts.map((row) => [row._id.toString(), row.count]));
  const phasesByTournament = new Map<string, TournamentPhase[]>();
  for (const doc of phaseDocs) {
    const key = doc.tournamentId.toString();
    const list = phasesByTournament.get(key) ?? [];
    list.push(toPhase(doc));
    phasesByTournament.set(key, list);
  }
  const roundsByTournament = new Map<string, TournamentRound[]>();
  for (const doc of roundDocs) {
    const key = doc.tournamentId.toString();
    const list = roundsByTournament.get(key) ?? [];
    list.push(toRound(doc));
    roundsByTournament.set(key, list);
  }

  // Les rondes courantes une fois toutes identifiées : leurs matchs se comptent
  // en une seule agrégation plutôt qu'une lecture par tournoi.
  const currentRounds = new Map<string, TournamentRound>();
  for (const tournament of tournaments) {
    const phases = phasesByTournament.get(tournament.id) ?? [];
    const rounds = roundsByTournament.get(tournament.id) ?? [];
    const activePhase = resolveDisplayPhase(phases, tournament.currentPhaseId);
    const currentRound = resolveCurrentRound(rounds, activePhase?.id);
    if (currentRound) currentRounds.set(tournament.id, currentRound);
  }

  const matchCounts =
    currentRounds.size > 0
      ? await db
          .collection<TournamentMatchDb>(MATCHES)
          .aggregate<{ _id: ObjectId; total: number; reported: number }>([
            {
              $match: {
                roundId: { $in: [...currentRounds.values()].map((r) => new ObjectId(r.id)) },
              },
            },
            {
              $group: {
                _id: "$roundId",
                total: { $sum: 1 },
                reported: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
              },
            },
          ])
          .toArray()
      : [];
  const matchesByRound = new Map(matchCounts.map((row) => [row._id.toString(), row]));

  for (const tournament of tournaments) {
    const phases = phasesByTournament.get(tournament.id) ?? [];
    const currentRound = currentRounds.get(tournament.id) ?? null;
    const currentPhase = currentRound ? phases.find((p) => p.id === currentRound.phaseId) : undefined;
    const counts = currentRound ? matchesByRound.get(currentRound.id) : undefined;

    summaries.set(tournament.id, {
      playersCount: playersByTournament.get(tournament.id) ?? 0,
      phases: phases.map((p) => ({ type: p.type, plannedRounds: p.plannedRounds, topCut: p.topCut })),
      currentRound: currentRound
        ? {
            id: currentRound.id,
            number: currentRound.number,
            plannedRounds: currentPhase?.plannedRounds,
            reportedMatches: counts?.reported ?? 0,
            totalMatches: counts?.total ?? 0,
          }
        : null,
    });
  }

  return summaries;
}

export function isTournamentOrganizer(tournament: Tournament, userId: string): boolean {
  return tournament.createdBy === userId || tournament.organizerIds.includes(userId);
}

export function isTournamentJudge(tournament: Tournament, userId: string): boolean {
  return tournament.judgeIds.includes(userId);
}

// Organisateurs et arbitres gèrent le tournoi (rondes, matchs, joueurs,
// réglages…). Seuls les organisateurs peuvent le supprimer et gérer le staff.
export function canManageTournament(tournament: Tournament, userId: string): boolean {
  return isTournamentOrganizer(tournament, userId) || isTournamentJudge(tournament, userId);
}

export function assertCanManage(tournament: Tournament, userId: string): void {
  if (!canManageTournament(tournament, userId)) {
    throw new TournamentError("forbidden", "Réservé aux organisateurs et arbitres du tournoi");
  }
}

// Tournoi déclaré par un événement (lien via Tournament.eventId). En cas de
// doublon inattendu, renvoie le plus récent.
export async function getTournamentByEventId(eventId: string): Promise<Tournament | null> {
  const doc = await db
    .collection<TournamentDb>(TOURNAMENTS)
    .findOne({ eventId }, { sort: { createdAt: -1 } });
  return doc ? toTournament(doc) : null;
}

/**
 * Tournois où l'utilisateur est inscrit comme joueur (via son compte). Permet
 * au portail « Mes tournois » de lister ses tournois sans dépendre d'une clé
 * de synchronisation sur ce navigateur : être connecté suffit.
 */
export async function listPlayerTournamentsForUser(
  userId: string
): Promise<{ tournament: Tournament; player: TournamentPlayer }[]> {
  const playerDocs = await db.collection<TournamentPlayerDb>(PLAYERS).find({ userId }).toArray();
  if (playerDocs.length === 0) return [];

  const tournamentIds = playerDocs.map((doc) => doc.tournamentId);
  const tournamentDocs = await db
    .collection<TournamentDb>(TOURNAMENTS)
    .find({ _id: { $in: tournamentIds } })
    .toArray();
  const tournamentsById = new Map(tournamentDocs.map((doc) => [doc._id.toString(), toTournament(doc)]));

  return playerDocs
    .map((doc) => {
      const tournament = tournamentsById.get(doc.tournamentId.toString());
      return tournament ? { tournament, player: toPlayer(doc) } : null;
    })
    .filter((entry): entry is { tournament: Tournament; player: TournamentPlayer } => entry !== null)
    .sort((a, b) => b.tournament.createdAt.getTime() - a.tournament.createdAt.getTime());
}

async function isTournamentPlayer(tournamentId: ObjectId, userId: string): Promise<boolean> {
  const player = await db
    .collection<TournamentPlayerDb>(PLAYERS)
    .findOne({ tournamentId, userId });
  return !!player;
}

// Read access: staff (organisateurs, arbitres) and registered players.
export async function assertCanReadTournament(tournament: Tournament, userId: string): Promise<void> {
  if (canManageTournament(tournament, userId)) return;
  if (await isTournamentPlayer(new ObjectId(tournament.id), userId)) return;
  throw new TournamentError("forbidden", "Accès non autorisé à ce tournoi");
}

// Qui adresse l'API tournoi : un utilisateur authentifié (session ou clé API
// jts_), ou un joueur de tournoi via sa clé de synchronisation tpsk_.
export type TournamentPrincipal =
  | { kind: "user"; userId: string }
  | { kind: "player"; player: TournamentPlayer };

export async function assertPrincipalCanRead(
  tournament: Tournament,
  principal: TournamentPrincipal
): Promise<void> {
  if (principal.kind === "player") {
    if (principal.player.tournamentId !== tournament.id) {
      throw new TournamentError("forbidden", "Accès non autorisé à ce tournoi");
    }
    return;
  }
  await assertCanReadTournament(tournament, principal.userId);
}

// Le principal est-il un membre du staff (organisateur ou arbitre) ?
export function principalCanManage(tournament: Tournament, principal: TournamentPrincipal): boolean {
  return principal.kind === "user" && canManageTournament(tournament, principal.userId);
}

// Acteur d'une opération de match : identité enregistrée dans
// reportedBy/confirmedBy (userId ou id de joueur pour une clé de sync), et
// les joueurs de tournoi que cette identité incarne.
export type MatchActor = {
  id: string;
  playerIds: string[];
  // Toutes les identités de la même personne physique (userId et ids de
  // joueur liés) : le check anti self-confirm compare reportedBy à cet
  // ensemble, pour qu'un joueur ne puisse pas confirmer son propre rapport
  // en alternant session et clé de synchronisation.
  identityIds: string[];
  isOrganizer: boolean;
  // Nom affichable de l'acteur pour le journal d'activité. Absent lorsque
  // l'identité n'est pas inscrite comme joueur (staff sans participation) :
  // le journal se rabat alors sur une mention générique.
  label?: string;
};

export async function buildMatchActor(
  tournament: Tournament,
  principal: TournamentPrincipal
): Promise<MatchActor> {
  if (principal.kind === "player") {
    const identityIds = [principal.player.id];
    if (principal.player.userId) identityIds.push(principal.player.userId);
    return {
      id: principal.player.id,
      playerIds: [principal.player.id],
      identityIds,
      isOrganizer: false,
      label: principal.player.displayName,
    };
  }
  const players = await listPlayers(tournament.id);
  const own = players.filter((p) => p.userId === principal.userId);
  const playerIds = own.map((p) => p.id);
  return {
    id: principal.userId,
    playerIds,
    identityIds: [principal.userId, ...playerIds],
    isOrganizer: canManageTournament(tournament, principal.userId),
    label: own[0]?.displayName,
  };
}

export function assertIsOrganizer(tournament: Tournament, userId: string): void {
  if (!isTournamentOrganizer(tournament, userId)) {
    throw new TournamentError("forbidden", "Réservé aux organisateurs du tournoi");
  }
}

// =====================
// STAFF (organisateurs / arbitres)
// =====================

export type TournamentStaffRole = "organizer" | "judge";

export type TournamentStaffEntry = {
  userId: string;
  displayName: string;
  discriminator?: string;
  role: TournamentStaffRole;
  isCreator: boolean;
};

// Staff du tournoi (créateur, organisateurs, arbitres) avec les noms résolus.
export async function listTournamentStaff(tournament: Tournament): Promise<TournamentStaffEntry[]> {
  const organizerIds = [...new Set([tournament.createdBy, ...tournament.organizerIds])];
  const judgeIds = tournament.judgeIds.filter((id) => !organizerIds.includes(id));

  const entries: TournamentStaffEntry[] = [];
  for (const [ids, role] of [
    [organizerIds, "organizer"],
    [judgeIds, "judge"],
  ] as const) {
    for (const userId of ids) {
      const user = await getUserById(userId);
      entries.push({
        userId,
        displayName: user?.displayName || user?.username || "Utilisateur inconnu",
        discriminator: user?.discriminator,
        role,
        isCreator: userId === tournament.createdBy,
      });
    }
  }
  return entries;
}

/**
 * Ajoute (ou change de rôle) un membre du staff, désigné par email ou tag
 * `username#discriminator`. L'utilisateur doit déjà avoir un compte. Le
 * créateur reste organisateur quoi qu'il arrive.
 */
export async function addTournamentStaff(
  tournamentId: string,
  identifier: string,
  role: TournamentStaffRole
): Promise<TournamentStaffEntry> {
  const tournament = await requireTournament(tournamentId);
  const trimmed = identifier.trim();

  let user;
  if (trimmed.includes("@")) {
    user = await getUserByEmail(trimmed);
  } else if (trimmed.includes("#")) {
    const hashIndex = trimmed.indexOf("#");
    const username = trimmed.slice(0, hashIndex).trim();
    const discriminator = trimmed.slice(hashIndex + 1).trim();
    if (!username || !/^\d{4}$/.test(discriminator)) {
      throw new TournamentError("invalid", "Tag invalide : utilisez le format username#0000");
    }
    user = await getUserByUsernameAndDiscriminator(username, discriminator);
  } else {
    throw new TournamentError(
      "invalid",
      "Désignez le membre du staff par email ou par tag username#0000"
    );
  }
  if (!user) {
    throw new TournamentError("not-found", `Utilisateur ${trimmed} non trouvé`);
  }
  if (user.id === tournament.createdBy) {
    throw new TournamentError("conflict", "Le créateur du tournoi est déjà organisateur");
  }

  // Change de rôle idempotent, en opérateurs atomiques ($pull puis $addToSet)
  // pour ne pas écraser des modifications concurrentes du staff.
  const _id = new ObjectId(tournamentId);
  await db
    .collection<TournamentDb>(TOURNAMENTS)
    .updateOne({ _id }, { $pull: { organizerIds: user.id, judgeIds: user.id } });
  await db.collection<TournamentDb>(TOURNAMENTS).updateOne(
    { _id },
    {
      $addToSet: { [role === "organizer" ? "organizerIds" : "judgeIds"]: user.id },
      $set: { updatedAt: new Date() },
    }
  );

  return {
    userId: user.id,
    displayName: user.displayName || user.username,
    discriminator: user.discriminator,
    role,
    isCreator: false,
  };
}

export async function removeTournamentStaff(tournamentId: string, userId: string): Promise<void> {
  const tournament = await requireTournament(tournamentId);
  if (userId === tournament.createdBy) {
    throw new TournamentError("conflict", "Le créateur du tournoi ne peut pas être retiré du staff");
  }
  // $pull atomique : pas de read-modify-write qui écraserait des mises à jour
  // concurrentes du staff.
  await db.collection<TournamentDb>(TOURNAMENTS).updateOne(
    { _id: new ObjectId(tournamentId) },
    {
      $pull: { organizerIds: userId, judgeIds: userId },
      $set: { updatedAt: new Date() },
    }
  );
}

// Loads the tournament or throws; use this at the top of every sub-resource operation.
export async function requireTournament(tournamentId: string): Promise<Tournament> {
  const tournament = await getTournamentById(tournamentId);
  if (!tournament) {
    throw new TournamentError("not-found", "Tournoi non trouvé");
  }
  return tournament;
}

export async function updateTournament(
  tournamentId: string,
  updates: {
    name?: string;
    status?: Tournament["status"];
    currentPhaseId?: string | null;
    // null = retirer le jeu associé.
    gameId?: string | null;
    // null = détacher le tournoi de son événement.
    eventId?: string | null;
    // Informations pratiques ; null retire la valeur.
    location?: string | null;
    startsAt?: Date | null;
    capacity?: number | null;
    settings?: Partial<Tournament["settings"]>;
    organizerIds?: string[];
    liveDisplay?: Tournament["liveDisplay"];
  }
): Promise<Tournament> {
  const _id = parseObjectId(tournamentId, "Tournoi");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  const unset: Record<string, ""> = {};

  if (updates.name !== undefined) set.name = updates.name;
  if (updates.status !== undefined) set.status = updates.status;
  if (updates.liveDisplay !== undefined) set.liveDisplay = updates.liveDisplay;
  if (updates.currentPhaseId === null) {
    unset.currentPhaseId = "";
  } else if (updates.currentPhaseId !== undefined) {
    set.currentPhaseId = updates.currentPhaseId;
  }
  if (updates.gameId === null) {
    unset.gameId = "";
  } else if (updates.gameId !== undefined) {
    set.gameId = updates.gameId;
  }
  if (updates.eventId === null) {
    unset.eventId = "";
  } else if (updates.eventId !== undefined) {
    // Un événement ne déclare qu'un seul tournoi : refuse la liaison si un
    // autre tournoi est déjà lié à cet événement.
    const alreadyLinked = await getTournamentByEventId(updates.eventId);
    if (alreadyLinked && alreadyLinked.id !== tournamentId) {
      throw new TournamentError(
        "conflict",
        `Un autre tournoi (« ${alreadyLinked.name} ») est déjà lié à cet événement`
      );
    }
    set.eventId = updates.eventId;
  }
  for (const field of ["location", "startsAt", "capacity"] as const) {
    const value = updates[field];
    if (value === null) {
      unset[field] = "";
    } else if (value !== undefined) {
      set[field] = value;
    }
  }
  if (updates.settings?.allowSelfReporting !== undefined) {
    set["settings.allowSelfReporting"] = updates.settings.allowSelfReporting;
  }
  if (updates.settings?.requireConfirmation !== undefined) {
    set["settings.requireConfirmation"] = updates.settings.requireConfirmation;
  }
  if (updates.settings?.preRegistration !== undefined) {
    set["settings.preRegistration"] = updates.settings.preRegistration;
  }
  if (updates.settings?.firstTableNumber !== undefined) {
    set["settings.firstTableNumber"] = updates.settings.firstTableNumber;
  }
  if (updates.organizerIds !== undefined) set.organizerIds = updates.organizerIds;

  const update: Record<string, unknown> = { $set: set };
  if (Object.keys(unset).length > 0) update.$unset = unset;

  const result = await db.collection<TournamentDb>(TOURNAMENTS).findOneAndUpdate(
    { _id },
    update,
    { returnDocument: "after" }
  );

  if (!result) {
    throw new TournamentError("not-found", "Tournoi non trouvé");
  }
  return toTournament(result);
}

export async function deleteTournament(tournamentId: string): Promise<void> {
  const _id = parseObjectId(tournamentId, "Tournoi");

  const result = await db.collection<TournamentDb>(TOURNAMENTS).deleteOne({ _id });
  if (result.deletedCount === 0) {
    throw new TournamentError("not-found", "Tournoi non trouvé");
  }

  await Promise.all([
    db.collection(PLAYERS).deleteMany({ tournamentId: _id }),
    db.collection(PHASES).deleteMany({ tournamentId: _id }),
    db.collection(ROUNDS).deleteMany({ tournamentId: _id }),
    db.collection(MATCHES).deleteMany({ tournamentId: _id }),
    db.collection(ANNOUNCEMENTS).deleteMany({ tournamentId: _id }),
    db.collection(PENALTIES).deleteMany({ tournamentId: _id }),
    db.collection(NOTES).deleteMany({ tournamentId: _id }),
    db.collection(ACTIVITY).deleteMany({ tournamentId: _id }),
  ]);
}

// =====================
// ANNOUNCEMENTS & TIMER
// =====================

function toAnnouncement(doc: WithId<TournamentAnnouncementDb>): TournamentAnnouncement {
  return {
    id: doc._id.toString(),
    tournamentId: doc.tournamentId.toString(),
    message: doc.message,
    level: doc.level,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}

export async function listAnnouncements(tournamentId: string): Promise<TournamentAnnouncement[]> {
  const _id = parseObjectId(tournamentId, "Tournoi");
  const docs = await db
    .collection<TournamentAnnouncementDb>(ANNOUNCEMENTS)
    .find({ tournamentId: _id })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(toAnnouncement);
}

export async function createAnnouncement(
  tournamentId: string,
  data: { message: string; level: TournamentAnnouncementLevel; createdBy: string }
): Promise<TournamentAnnouncement> {
  const _id = parseObjectId(tournamentId, "Tournoi");
  const doc: TournamentAnnouncementDb = {
    tournamentId: _id,
    message: data.message,
    level: data.level,
    createdBy: data.createdBy,
    createdAt: new Date(),
  };
  const result = await db.collection<TournamentAnnouncementDb>(ANNOUNCEMENTS).insertOne(doc);
  return toAnnouncement({ ...doc, _id: result.insertedId });
}

export async function deleteAnnouncement(tournamentId: string, announcementId: string): Promise<void> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const aId = parseObjectId(announcementId, "Annonce");
  const result = await db
    .collection<TournamentAnnouncementDb>(ANNOUNCEMENTS)
    .deleteOne({ _id: aId, tournamentId: tId });
  if (result.deletedCount === 0) {
    throw new TournamentError("not-found", "Annonce non trouvée");
  }
}

// ==================================
// JOURNAL D'ACTIVITÉ
// ==================================

function toActivity(doc: WithId<TournamentActivityDb>): TournamentActivity {
  return {
    id: doc._id.toString(),
    tournamentId: doc.tournamentId.toString(),
    type: doc.type,
    params: doc.params ?? {},
    actorLabel: doc.actorLabel,
    createdAt: doc.createdAt,
  };
}

/**
 * Enregistre un événement dans le journal d'activité du tournoi.
 *
 * Volontairement tolérant aux pannes : le journal est un confort d'affichage
 * pour l'organisation, jamais une source de vérité. Une écriture en échec est
 * tracée mais n'interrompt pas l'action métier qui l'a déclenchée — appeler
 * cette fonction ne peut donc pas faire échouer un rapport de résultat.
 */
export async function recordActivity(
  tournamentId: string,
  type: TournamentActivityType,
  params: Record<string, string | number> = {},
  actorLabel?: string
): Promise<void> {
  try {
    const _id = parseObjectId(tournamentId, "Tournoi");
    const coll = db.collection<TournamentActivityDb>(ACTIVITY);
    await coll.insertOne({
      tournamentId: _id,
      type,
      params,
      actorLabel,
      createdAt: new Date(),
    });
    // Purge des événements au-delà de la fenêtre conservée.
    const stale = await coll
      .find({ tournamentId: _id }, { projection: { _id: 1 } })
      .sort({ createdAt: -1 })
      .skip(ACTIVITY_KEEP)
      .toArray();
    if (stale.length > 0) {
      await coll.deleteMany({ _id: { $in: stale.map((d) => d._id) } });
    }
  } catch (error) {
    console.error("Impossible d'enregistrer l'activité du tournoi:", error);
  }
}

export async function listActivity(tournamentId: string, limit = 30): Promise<TournamentActivity[]> {
  const _id = parseObjectId(tournamentId, "Tournoi");
  const docs = await db
    .collection<TournamentActivityDb>(ACTIVITY)
    .find({ tournamentId: _id })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), ACTIVITY_KEEP))
    .toArray();
  return docs.map(toActivity);
}

// ==================================
// PÉNALITÉS ET NOTES INTERNES
// ==================================

function toPenalty(doc: WithId<TournamentPenaltyDb>): TournamentPenalty {
  return {
    id: doc._id.toString(),
    tournamentId: doc.tournamentId.toString(),
    playerId: doc.playerId.toString(),
    type: doc.type,
    reason: doc.reason,
    roundId: doc.roundId,
    roundNumber: doc.roundNumber,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}

function toNote(doc: WithId<TournamentNoteDb>): TournamentNote {
  return {
    id: doc._id.toString(),
    tournamentId: doc.tournamentId.toString(),
    playerId: doc.playerId.toString(),
    content: doc.content,
    roundNumber: doc.roundNumber,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}

// Pénalités du tournoi entier, ou d'un seul joueur quand `playerId` est fourni.
// La liste complète alimente le drapeau ⚑ de la liste des joueurs sans avoir à
// interroger la fiche de chacun.
export async function listPenalties(
  tournamentId: string,
  playerId?: string
): Promise<TournamentPenalty[]> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const filter: Record<string, unknown> = { tournamentId: tId };
  if (playerId) filter.playerId = parseObjectId(playerId, "Joueur");
  const docs = await db
    .collection<TournamentPenaltyDb>(PENALTIES)
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(toPenalty);
}

export async function createPenalty(
  tournamentId: string,
  playerId: string,
  data: {
    type: TournamentPenaltyType;
    reason?: string;
    roundId?: string;
    roundNumber?: number;
    createdBy: string;
  }
): Promise<TournamentPenalty> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const pId = parseObjectId(playerId, "Joueur");

  const player = await getPlayerById(tournamentId, playerId);
  if (!player) {
    throw new TournamentError("not-found", "Joueur non trouvé");
  }

  const doc: TournamentPenaltyDb = {
    tournamentId: tId,
    playerId: pId,
    type: data.type,
    reason: data.reason,
    roundId: data.roundId,
    roundNumber: data.roundNumber,
    createdBy: data.createdBy,
    createdAt: new Date(),
  };
  const result = await db.collection<TournamentPenaltyDb>(PENALTIES).insertOne(doc);

  // Une disqualification retire le joueur du tournoi : il ne doit plus être
  // apparié aux rondes suivantes.
  if (data.type === "disqualification" && player.status !== "dropped") {
    await updatePlayer(tournamentId, playerId, { status: "dropped" });
  }

  return toPenalty({ ...doc, _id: result.insertedId });
}

export async function deletePenalty(tournamentId: string, penaltyId: string): Promise<void> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const id = parseObjectId(penaltyId, "Pénalité");
  const result = await db
    .collection<TournamentPenaltyDb>(PENALTIES)
    .deleteOne({ _id: id, tournamentId: tId });
  if (result.deletedCount === 0) {
    throw new TournamentError("not-found", "Pénalité non trouvée");
  }
}

export async function listNotes(tournamentId: string, playerId: string): Promise<TournamentNote[]> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const pId = parseObjectId(playerId, "Joueur");
  const docs = await db
    .collection<TournamentNoteDb>(NOTES)
    .find({ tournamentId: tId, playerId: pId })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(toNote);
}

export async function createNote(
  tournamentId: string,
  playerId: string,
  data: { content: string; roundNumber?: number; createdBy: string }
): Promise<TournamentNote> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const pId = parseObjectId(playerId, "Joueur");

  const player = await getPlayerById(tournamentId, playerId);
  if (!player) {
    throw new TournamentError("not-found", "Joueur non trouvé");
  }

  const doc: TournamentNoteDb = {
    tournamentId: tId,
    playerId: pId,
    content: data.content,
    roundNumber: data.roundNumber,
    createdBy: data.createdBy,
    createdAt: new Date(),
  };
  const result = await db.collection<TournamentNoteDb>(NOTES).insertOne(doc);
  return toNote({ ...doc, _id: result.insertedId });
}

export async function deleteNote(tournamentId: string, noteId: string): Promise<void> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const id = parseObjectId(noteId, "Note");
  const result = await db.collection<TournamentNoteDb>(NOTES).deleteOne({ _id: id, tournamentId: tId });
  if (result.deletedCount === 0) {
    throw new TournamentError("not-found", "Note non trouvée");
  }
}

// Liste de deck d'un joueur. Modifier le contenu invalide la vérification
// précédente : une liste retouchée doit être revérifiée par l'arbitrage.
export async function updateDecklist(
  tournamentId: string,
  playerId: string,
  updates: { content?: string; checked?: boolean },
  actorUserId: string
): Promise<TournamentPlayer> {
  const player = await getPlayerById(tournamentId, playerId);
  if (!player) {
    throw new TournamentError("not-found", "Joueur non trouvé");
  }

  const now = new Date();
  const content = updates.content ?? player.decklist?.content ?? "";
  const contentChanged = updates.content !== undefined && updates.content !== player.decklist?.content;
  const checked = contentChanged && updates.checked === undefined ? false : updates.checked ?? player.decklist?.checked ?? false;

  const decklist: TournamentDecklist = {
    content,
    checked,
    checkedBy: checked ? actorUserId : undefined,
    checkedAt: checked ? now : undefined,
    updatedAt: now,
  };

  const tId = parseObjectId(tournamentId, "Tournoi");
  const pId = parseObjectId(playerId, "Joueur");
  const result = await db
    .collection<TournamentPlayerDb>(PLAYERS)
    .findOneAndUpdate({ _id: pId, tournamentId: tId }, { $set: { decklist } }, { returnDocument: "after" });
  if (!result) {
    throw new TournamentError("not-found", "Joueur non trouvé");
  }
  return toPlayer(result);
}

// ── Formulaire d'inscription ────────────────────────────────────────────────

const generateFormFieldId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

/**
 * Enregistre la configuration du formulaire. Les champs déjà existants gardent
 * leur identifiant — c'est lui qui rattache les réponses déjà données, un
 * renommage ou un réordonnancement ne doit rien perdre.
 */
export async function saveTournamentForm(
  tournamentId: string,
  input: {
    fields: {
      id?: string;
      type: TournamentFormField["type"];
      label: string;
      description?: string;
      required: boolean;
      options?: string[];
    }[];
    playerEditable: boolean;
    closesAt?: Date | null;
    lateSubmissions: boolean;
  }
): Promise<TournamentForm> {
  const _id = parseObjectId(tournamentId, "Tournoi");

  const seen = new Set<string>();
  const fields: TournamentFormField[] = input.fields.map((field) => {
    // Un identifiant absent ou déjà pris (copier-coller d'un champ) en reçoit
    // un neuf : deux champs partageant un id mélangeraient leurs réponses.
    const id = field.id && !seen.has(field.id) ? field.id : generateFormFieldId();
    seen.add(id);
    const choices = field.type === "single-choice" || field.type === "multiple-choice";
    return {
      id,
      type: field.type,
      label: field.label.trim(),
      description: field.description?.trim() || undefined,
      required: field.required,
      options: choices ? field.options?.map((option) => option.trim()).filter(Boolean) : undefined,
    };
  });

  const form: TournamentForm = {
    fields,
    playerEditable: input.playerEditable,
    closesAt: input.closesAt ?? undefined,
    lateSubmissions: input.lateSubmissions,
  };

  const result = await db
    .collection<TournamentDb>(TOURNAMENTS)
    .findOneAndUpdate(
      { _id },
      { $set: { registrationForm: form, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
  if (!result) {
    throw new TournamentError("not-found", "Tournoi non trouvé");
  }
  return form;
}

/**
 * Le joueur peut-il encore modifier ses réponses ? Deux verrous indépendants :
 * l'organisateur peut fermer la modification, et poser une date limite.
 */
export function formIsOpenForPlayer(tournament: Tournament, now = new Date()): boolean {
  const form = tournament.registrationForm;
  if (!form || form.fields.length === 0) return false;
  if (!form.playerEditable) return false;
  return !form.closesAt || form.closesAt.getTime() > now.getTime();
}

/**
 * La saisie normale est close, mais l'organisateur accepte encore les réponses
 * tardives : le joueur peut répondre, et ce qu'il enregistre est marqué.
 */
export function formIsInLateWindow(tournament: Tournament, now = new Date()): boolean {
  const form = tournament.registrationForm;
  if (!form || form.fields.length === 0) return false;
  return form.lateSubmissions && !formIsOpenForPlayer(tournament, now);
}

/** Le joueur peut-il enregistrer une réponse, dans les temps ou tardivement ? */
export function formAcceptsPlayerAnswers(tournament: Tournament, now = new Date()): boolean {
  return formIsOpenForPlayer(tournament, now) || formIsInLateWindow(tournament, now);
}

export function assertFormAcceptsPlayerAnswers(tournament: Tournament): void {
  const form = tournament.registrationForm;
  if (!form || form.fields.length === 0) {
    throw new TournamentError("not-found", "Ce tournoi n'a pas de formulaire");
  }
  if (formAcceptsPlayerAnswers(tournament)) return;
  if (!form.playerEditable) {
    throw new TournamentError("forbidden", "Les réponses ne sont plus modifiables");
  }
  throw new TournamentError("forbidden", "La date limite de réponse est dépassée");
}

/**
 * Enregistre les réponses d'un joueur. L'envoi porte le formulaire entier :
 * un champ absent de l'envoi voit sa réponse effacée.
 *
 * `enforceRequired` n'est levé que pour les saisies venues de l'organisation :
 * elle recopie parfois un formulaire papier incomplet, et refuser la saisie
 * lui ferait perdre ce qu'elle a. Un joueur, lui, doit répondre à tout.
 *
 * `markLate` signale les réponses enregistrées hors délai. Une réponse dont la
 * valeur n'a pas bougé est reconduite telle quelle : rouvrir le formulaire
 * hors délai ne doit pas rendre tardif ce qui a été répondu dans les temps.
 */
export async function saveFormAnswers(
  tournament: Tournament,
  playerId: string,
  answers: {
    fieldId: string;
    text?: string;
    number?: number;
    choices?: string[];
    card?: TournamentFormAnswer["card"];
    decklist?: string;
  }[],
  { enforceRequired, markLate = false }: { enforceRequired: boolean; markLate?: boolean }
): Promise<TournamentFormAnswer[]> {
  const form = tournament.registrationForm;
  if (!form || form.fields.length === 0) {
    throw new TournamentError("not-found", "Ce tournoi n'a pas de formulaire");
  }

  const player = await getPlayerById(tournament.id, playerId);
  if (!player) {
    throw new TournamentError("not-found", "Joueur non trouvé");
  }

  const submitted = new Map(answers.map((answer) => [answer.fieldId, answer]));
  const previous = new Map((player.formAnswers ?? []).map((answer) => [answer.fieldId, answer]));
  const now = new Date();

  const saved: TournamentFormAnswer[] = [];
  for (const field of form.fields) {
    const answer = submitted.get(field.id);
    const before = previous.get(field.id);
    const value = answer
      ? await normalizeAnswer(field, answer, before, tournament.gameId, now)
      : null;

    if (!value) {
      if (field.required && enforceRequired) {
        throw new TournamentError("invalid", `« ${field.label} » est obligatoire`);
      }
      continue;
    }

    // Valeur inchangée : on garde la réponse d'origine, avec sa date et son
    // éventuelle marque de retard.
    if (before && sameAnswerValue(before, value)) {
      saved.push(before);
      continue;
    }
    saved.push(markLate ? { ...value, late: true } : value);
  }

  const tId = parseObjectId(tournament.id, "Tournoi");
  const pId = parseObjectId(playerId, "Joueur");
  const result = await db
    .collection<TournamentPlayerDb>(PLAYERS)
    .findOneAndUpdate(
      { _id: pId, tournamentId: tId },
      { $set: { formAnswers: saved } },
      { returnDocument: "after" }
    );
  if (!result) {
    throw new TournamentError("not-found", "Joueur non trouvé");
  }
  return saved;
}

/**
 * Deux réponses portent-elles la même valeur ? Un champ n'en porte qu'une
 * sorte, il suffit donc de comparer chaque clé : identifiant pour une carte,
 * contenu retenu pour une liste de deck (le résultat de l'analyse en découle).
 * Deux envois du même lien se comparent donc sur les cartes récupérées : un
 * deck inchangé chez Piltover Archive ne compte pas comme une nouvelle
 * réponse, un deck modifié entre-temps si.
 */
function sameAnswerValue(a: TournamentFormAnswer, b: TournamentFormAnswer): boolean {
  const choicesA = a.choices ?? [];
  const choicesB = b.choices ?? [];
  return (
    a.text === b.text &&
    a.number === b.number &&
    choicesA.length === choicesB.length &&
    choicesA.every((choice, index) => choice === choicesB[index]) &&
    (a.card?.cardId ?? null) === (b.card?.cardId ?? null) &&
    (a.decklist?.input ?? null) === (b.decklist?.input ?? null)
  );
}

/**
 * Réponse retenue pour un champ, ou null si le joueur n'a rien répondu. Chaque
 * type ne lit que la clé qui le concerne : une réponse envoyée dans la
 * mauvaise clé est ignorée plutôt que stockée sous un type qui ne l'affichera
 * jamais.
 */
async function normalizeAnswer(
  field: TournamentFormField,
  answer: {
    text?: string;
    number?: number;
    choices?: string[];
    card?: TournamentFormAnswer["card"];
    decklist?: string;
  },
  previous: TournamentFormAnswer | undefined,
  gameId: string | undefined,
  now: Date
): Promise<TournamentFormAnswer | null> {
  const base = { fieldId: field.id, updatedAt: now };

  switch (field.type) {
    case "text":
    case "long-text": {
      const text = answer.text?.trim();
      return text ? { ...base, text } : null;
    }
    case "number": {
      return typeof answer.number === "number" && Number.isFinite(answer.number)
        ? { ...base, number: answer.number }
        : null;
    }
    case "single-choice":
    case "multiple-choice": {
      // Les choix hors options sont écartés : l'organisateur a pu retirer une
      // option depuis, et un formulaire ouvert reste modifiable côté client.
      const options = new Set(field.options ?? []);
      const choices = (answer.choices ?? []).filter((choice) => options.has(choice));
      const kept = field.type === "single-choice" ? choices.slice(0, 1) : choices;
      return kept.length > 0 ? { ...base, choices: kept } : null;
    }
    case "card": {
      return answer.card ? { ...base, card: answer.card } : null;
    }
    case "decklist": {
      const input = answer.decklist?.trim();
      if (!input) return null;
      // Liste inchangée : l'analyse précédente est conservée telle quelle,
      // inutile de rappeler Piltover Archive à chaque enregistrement. Un lien
      // ou un code renvoyé ne correspond jamais à ce qui est stocké (des
      // cartes) : il est relu, et c'est le deck du moment qui fait foi.
      if (previous?.decklist && previous.decklist.input === input) {
        return { ...base, decklist: previous.decklist };
      }
      return { ...base, decklist: await parseDecklistAnswer(gameId, input) };
    }
  }
}

// Démarre le minuteur : fixe l'instant de fin absolu (now + durée).
export async function startTimer(tournamentId: string, durationSeconds: number): Promise<Tournament> {
  return updateTournamentTimer(tournamentId, {
    durationSeconds,
    endsAt: new Date(Date.now() + durationSeconds * 1000),
    running: true,
  });
}

// Met le minuteur en pause : mémorise le temps restant et efface l'instant de
// fin. Sans effet si le minuteur ne tourne pas.
export async function pauseTimer(tournamentId: string): Promise<Tournament> {
  const tournament = await requireTournament(tournamentId);
  const timer = tournament.timer;
  if (!timer?.running || !timer.endsAt) {
    return tournament;
  }
  const remainingSeconds = (timer.endsAt.getTime() - Date.now()) / 1000;
  return updateTournamentTimer(tournamentId, {
    durationSeconds: timer.durationSeconds,
    running: false,
    remainingSeconds,
  });
}

// Reprend un minuteur en pause : recalcule un instant de fin à partir du temps
// restant mémorisé. Sans effet s'il n'y a pas de temps mémorisé.
export async function resumeTimer(tournamentId: string): Promise<Tournament> {
  const tournament = await requireTournament(tournamentId);
  const timer = tournament.timer;
  if (!timer || timer.running || timer.remainingSeconds === undefined) {
    return tournament;
  }
  return updateTournamentTimer(tournamentId, {
    durationSeconds: timer.durationSeconds,
    endsAt: new Date(Date.now() + timer.remainingSeconds * 1000),
    running: true,
  });
}

// Arrête le minuteur (conserve la durée configurée).
export async function stopTimer(tournamentId: string): Promise<Tournament> {
  const tournament = await requireTournament(tournamentId);
  return updateTournamentTimer(tournamentId, {
    durationSeconds: tournament.timer?.durationSeconds ?? 0,
    running: false,
  });
}

async function updateTournamentTimer(
  tournamentId: string,
  timer: NonNullable<Tournament["timer"]>
): Promise<Tournament> {
  const _id = parseObjectId(tournamentId, "Tournoi");
  const result = await db
    .collection<TournamentDb>(TOURNAMENTS)
    .findOneAndUpdate({ _id }, { $set: { timer } }, { returnDocument: "after" });
  if (!result) {
    throw new TournamentError("not-found", "Tournoi non trouvé");
  }
  return toTournament(result);
}

// =====================
// PLAYERS
// =====================

export async function listPlayers(tournamentId: string): Promise<TournamentPlayer[]> {
  const _id = parseObjectId(tournamentId, "Tournoi");
  const docs = await db
    .collection<TournamentPlayerDb>(PLAYERS)
    .find({ tournamentId: _id })
    .sort({ seed: 1, createdAt: 1 })
    .toArray();
  return docs.map(toPlayer);
}

export async function getPlayerById(tournamentId: string, playerId: string): Promise<TournamentPlayer | null> {
  if (!ObjectId.isValid(tournamentId) || !ObjectId.isValid(playerId)) return null;
  const doc = await db.collection<TournamentPlayerDb>(PLAYERS).findOne({
    _id: new ObjectId(playerId),
    tournamentId: new ObjectId(tournamentId),
  });
  return doc ? toPlayer(doc) : null;
}

// Nombre à 4 chiffres (1000–9999) attribué à un invité pour le distinguer d'un
// éventuel homonyme. On retente quelques fois pour éviter une collision sur un
// même (displayName, discriminator) dans le tournoi.
async function generateGuestDiscriminator(
  tournamentId: ObjectId,
  displayName: string
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = String(Math.floor(1000 + Math.random() * 9000));
    const clash = await db.collection<TournamentPlayerDb>(PLAYERS).findOne({
      tournamentId,
      displayName,
      discriminator: candidate,
    });
    if (!clash) return candidate;
  }
  throw new TournamentError(
    "conflict",
    "Impossible d'attribuer un identifiant unique à ce joueur invité"
  );
}

export async function addPlayer(
  tournamentId: string,
  data: {
    displayName: string;
    userId?: string;
    seed?: number;
    addedBy: string;
    status?: TournamentPlayer["status"];
  }
): Promise<TournamentPlayer> {
  const _id = parseObjectId(tournamentId, "Tournoi");

  if (data.userId) {
    const existing = await db
      .collection<TournamentPlayerDb>(PLAYERS)
      .findOne({ tournamentId: _id, userId: data.userId });
    if (existing) {
      throw new TournamentError("conflict", "Ce joueur est déjà inscrit au tournoi");
    }
  }

  // Discriminateur affiché à côté du nom : repris du compte pour un joueur
  // connecté, sinon nombre à 4 chiffres aléatoire pour un invité (différencie
  // les homonymes).
  const discriminator = data.userId
    ? (await getUserDiscriminator(data.userId)) ?? undefined
    : await generateGuestDiscriminator(_id, data.displayName);

  const doc: TournamentPlayerDb = {
    tournamentId: _id,
    userId: data.userId,
    displayName: data.displayName,
    discriminator,
    seed: data.seed,
    status: data.status ?? "registered",
    syncKey: `tpsk_${crypto.randomBytes(24).toString("hex")}`,
    addedBy: data.addedBy,
    createdAt: new Date(),
  };

  const result = await db.collection<TournamentPlayerDb>(PLAYERS).insertOne(doc);
  return toPlayer({ ...doc, _id: result.insertedId });
}

/**
 * Ajoute un joueur à partir d'un identifiant libre :
 * - `username#discriminator` → utilisateur recherché par tag ; s'il n'existe
 *   pas, erreur (un discriminateur explicite désigne un compte précis).
 * - email → utilisateur recherché par email ; s'il n'existe pas, un compte
 *   invité est créé avant d'inscrire le joueur.
 * - sinon (simple nom) → joueur invité sans compte.
 */
export async function addPlayerByIdentifier(
  tournamentId: string,
  data: { identifier: string; seed?: number; addedBy: string }
): Promise<TournamentPlayer> {
  const identifier = data.identifier.trim();

  // Tag username#discriminator : le discriminateur désigne un compte précis.
  const hashIndex = identifier.indexOf("#");
  if (hashIndex !== -1) {
    const displayName = identifier.slice(0, hashIndex).trim();
    const discriminator = identifier.slice(hashIndex + 1).trim();
    // Format strict : un seul '#', un discriminateur à exactement 4 chiffres.
    // Sinon on renvoie une erreur de format claire plutôt qu'un 404 ambigu.
    if (!displayName || !/^\d{4}$/.test(discriminator)) {
      throw new TournamentError("invalid", "Tag invalide : utilisez le format username#0000");
    }
    const user = await getUserByUsernameAndDiscriminator(displayName, discriminator);
    if (!user) {
      throw new TournamentError("not-found", `Utilisateur ${identifier} non trouvé`);
    }
    return addPlayer(tournamentId, {
      displayName: user.displayName || user.username,
      userId: user.id,
      seed: data.seed,
      addedBy: data.addedBy,
    });
  }

  // Email : utilisateur existant, ou création d'un compte invité.
  if (EMAIL_REGEX.test(identifier)) {
    const existing = await getUserByEmail(identifier);
    const user = existing ?? (await createInvitedUserByEmail(identifier, "tournament-invite"));
    return addPlayer(tournamentId, {
      displayName: user.displayName || user.username,
      userId: user.id,
      seed: data.seed,
      addedBy: data.addedBy,
    });
  }

  // Simple nom d'utilisateur → invité sans compte.
  return addPlayer(tournamentId, {
    displayName: identifier,
    seed: data.seed,
    addedBy: data.addedBy,
  });
}

/**
 * Résout une clé de synchronisation joueur (tpsk_...) vers le joueur qui la
 * porte, tous tournois confondus. La clé est le secret : pas d'autre
 * authentification requise.
 */
export async function getPlayerBySyncKey(syncKey: string): Promise<TournamentPlayer | null> {
  if (!syncKey.startsWith("tpsk_")) return null;
  const doc = await db.collection<TournamentPlayerDb>(PLAYERS).findOne({ syncKey });
  return doc ? toPlayer(doc) : null;
}

/**
 * Auto-inscription d'un joueur à un tournoi via son code de participation.
 * - Avec un compte (userId) : lié au compte ; si déjà inscrit, renvoie
 *   l'inscription existante (idempotent).
 * - Sans compte : ajouté comme invité (displayName requis).
 * Le statut dépend du mode pré-inscription du tournoi (PRE-REGISTERED sinon
 * REGISTERED).
 */
export async function joinTournament(
  tournament: Tournament,
  data: { userId?: string; displayName?: string }
): Promise<{ player: TournamentPlayer; alreadyJoined: boolean }> {
  if (tournament.status === "completed") {
    throw new TournamentError("conflict", "Ce tournoi est terminé : les inscriptions sont closes");
  }

  const status: TournamentPlayer["status"] = tournament.settings.preRegistration
    ? "pre-registered"
    : "registered";

  if (data.userId) {
    const existing = await db.collection<TournamentPlayerDb>(PLAYERS).findOne({
      tournamentId: new ObjectId(tournament.id),
      userId: data.userId,
    });
    if (existing) return { player: toPlayer(existing), alreadyJoined: true };

    const player = await addPlayer(tournament.id, {
      displayName: data.displayName?.trim() || "Joueur",
      userId: data.userId,
      addedBy: data.userId,
      status,
    });
    return { player, alreadyJoined: false };
  }

  const name = data.displayName?.trim();
  if (!name) {
    throw new TournamentError("invalid", "Un nom d'utilisateur est requis pour rejoindre sans compte");
  }
  const player = await addPlayer(tournament.id, {
    displayName: name,
    addedBy: "self-join",
    status,
  });
  return { player, alreadyJoined: false };
}

export async function updatePlayer(
  tournamentId: string,
  playerId: string,
  updates: {
    displayName?: string;
    seed?: number | null;
    fixedTableNumber?: number | null;
    status?: TournamentPlayer["status"];
    // true pointe le joueur présent (horodaté maintenant), false annule.
    checkedIn?: boolean;
  }
): Promise<TournamentPlayer> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const pId = parseObjectId(playerId, "Joueur");

  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  if (updates.displayName !== undefined) set.displayName = updates.displayName;
  if (updates.seed === null) {
    unset.seed = "";
  } else if (updates.seed !== undefined) {
    set.seed = updates.seed;
  }
  if (updates.fixedTableNumber === null) {
    unset.fixedTableNumber = "";
  } else if (updates.fixedTableNumber !== undefined) {
    set.fixedTableNumber = updates.fixedTableNumber;
  }
  if (updates.status !== undefined) set.status = updates.status;
  if (updates.checkedIn === true) {
    set.checkedInAt = new Date();
  } else if (updates.checkedIn === false) {
    unset.checkedInAt = "";
  }

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length > 0) update.$set = set;
  if (Object.keys(unset).length > 0) update.$unset = unset;
  if (Object.keys(update).length === 0) {
    const current = await getPlayerById(tournamentId, playerId);
    if (!current) throw new TournamentError("not-found", "Joueur non trouvé");
    return current;
  }

  const result = await db.collection<TournamentPlayerDb>(PLAYERS).findOneAndUpdate(
    { _id: pId, tournamentId: tId },
    update,
    { returnDocument: "after" }
  );

  if (!result) {
    throw new TournamentError("not-found", "Joueur non trouvé");
  }
  return toPlayer(result);
}

// Participant d'un événement candidat à l'import dans le tournoi lié, avec le
// statut de joueur de tournoi déduit de son statut d'inscription à l'événement.
export type EventImportCandidate = {
  userId?: string;
  displayName: string;
  status: TournamentPlayerStatus;
};

export type EventImportPlan = {
  // Participants absents du tournoi, à inscrire avec leur statut.
  toAdd: { displayName: string; userId?: string; status: TournamentPlayerStatus }[];
  // Joueurs déjà inscrits dont le statut va changer.
  toUpdate: {
    playerId: string;
    displayName: string;
    discriminator?: string;
    currentStatus: TournamentPlayerStatus;
    newStatus: TournamentPlayerStatus;
  }[];
  // Joueurs déjà inscrits dont le statut est déjà le bon.
  unchangedCount: number;
  // Nombre total de joueurs actuellement inscrits au tournoi.
  existingPlayersCount: number;
};

/**
 * Calcule le plan d'import des participants d'un événement dans le tournoi :
 * rapprochement par userId (comptes) puis par nom affiché (invités, insensible
 * à la casse). Ne modifie rien : sert d'aperçu avant applyEventPlayersImport.
 */
export async function planEventPlayersImport(
  tournamentId: string,
  candidates: EventImportCandidate[]
): Promise<EventImportPlan> {
  const players = await listPlayers(tournamentId);
  const byUserId = new Map(players.filter((p) => p.userId).map((p) => [p.userId as string, p]));
  const byName = new Map(players.map((p) => [p.displayName.trim().toLowerCase(), p]));

  const plan: EventImportPlan = {
    toAdd: [],
    toUpdate: [],
    unchangedCount: 0,
    existingPlayersCount: players.length,
  };
  const matchedPlayerIds = new Set<string>();
  // Candidats déjà planifiés (par compte ou par nom normalisé) : un même
  // participant présent deux fois (ex. compte + invité) n'est traité qu'une
  // seule fois au lieu de produire un ajout en doublon qui échouerait.
  const plannedKeys = new Set<string>();

  for (const candidate of candidates) {
    const normalizedName = candidate.displayName.trim().toLowerCase();
    const candidateKey = candidate.userId ?? `name:${normalizedName}`;
    if (plannedKeys.has(candidateKey)) continue;
    plannedKeys.add(candidateKey);

    const existing = (candidate.userId && byUserId.get(candidate.userId)) || byName.get(normalizedName);
    if (!existing) {
      plan.toAdd.push({
        displayName: candidate.displayName,
        userId: candidate.userId,
        status: candidate.status,
      });
      continue;
    }
    // Joueur déjà rapproché par un candidat précédent : doublon, ignoré.
    if (matchedPlayerIds.has(existing.id)) continue;
    matchedPlayerIds.add(existing.id);
    if (existing.status === candidate.status) {
      plan.unchangedCount++;
    } else {
      plan.toUpdate.push({
        playerId: existing.id,
        displayName: existing.displayName,
        discriminator: existing.discriminator,
        currentStatus: existing.status,
        newStatus: candidate.status,
      });
    }
  }

  return plan;
}

/**
 * Applique l'import des participants d'un événement : inscrit les absents avec
 * leur statut et aligne le statut des joueurs déjà inscrits. Le plan est
 * recalculé au moment de l'application (l'aperçu peut dater).
 */
export async function applyEventPlayersImport(
  tournamentId: string,
  candidates: EventImportCandidate[],
  addedBy: string
): Promise<{ added: number; updated: number; unchangedCount: number }> {
  const plan = await planEventPlayersImport(tournamentId, candidates);

  for (const entry of plan.toAdd) {
    await addPlayer(tournamentId, {
      displayName: entry.displayName,
      userId: entry.userId,
      status: entry.status,
      addedBy,
    });
  }
  for (const entry of plan.toUpdate) {
    await updatePlayer(tournamentId, entry.playerId, { status: entry.newStatus });
  }

  return {
    added: plan.toAdd.length,
    updated: plan.toUpdate.length,
    unchangedCount: plan.unchangedCount,
  };
}

export async function removePlayer(tournamentId: string, playerId: string): Promise<void> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const pId = parseObjectId(playerId, "Joueur");

  const hasMatches = await db.collection<TournamentMatchDb>(MATCHES).findOne({
    tournamentId: tId,
    "players.playerId": playerId,
  });
  if (hasMatches) {
    throw new TournamentError(
      "conflict",
      "Ce joueur a déjà des matchs : marquez-le comme 'dropped' plutôt que de le supprimer"
    );
  }

  const result = await db.collection<TournamentPlayerDb>(PLAYERS).deleteOne({ _id: pId, tournamentId: tId });
  if (result.deletedCount === 0) {
    throw new TournamentError("not-found", "Joueur non trouvé");
  }
}

// =====================
// PHASES
// =====================

export async function listPhases(tournamentId: string): Promise<TournamentPhase[]> {
  const _id = parseObjectId(tournamentId, "Tournoi");
  const docs = await db
    .collection<TournamentPhaseDb>(PHASES)
    .find({ tournamentId: _id })
    .sort({ order: 1, createdAt: 1 })
    .toArray();
  return docs.map(toPhase);
}

export async function getPhaseById(tournamentId: string, phaseId: string): Promise<TournamentPhase | null> {
  if (!ObjectId.isValid(tournamentId) || !ObjectId.isValid(phaseId)) return null;
  const doc = await db.collection<TournamentPhaseDb>(PHASES).findOne({
    _id: new ObjectId(phaseId),
    tournamentId: new ObjectId(tournamentId),
  });
  return doc ? toPhase(doc) : null;
}

// L'élimination directe est intrinsèquement 2 joueurs : on refuse tout autre
// intervalle sur une phase bracket.
function assertPlayerBoundsForType(
  type: TournamentPhase["type"],
  min: number,
  max: number
): void {
  if (min < 2 || max < min) {
    throw new TournamentError("invalid", "Bornes de joueurs par match invalides");
  }
  if (type === "bracket" && (min !== 2 || max !== 2)) {
    throw new TournamentError("invalid", "Une phase à élimination directe n'accepte que des matchs à 2 joueurs");
  }
}

export async function addPhase(
  tournamentId: string,
  data: {
    name: string;
    type: TournamentPhase["type"];
    bestOf?: number;
    resultMode?: TournamentResultMode;
    scoringMethod?: TournamentScoringMethod;
    fixedScoring?: TournamentFixedScoring;
    rankOffsets?: number[];
    eliminationSeeding?: TournamentEliminationSeeding;
    bracketSeeding?: TournamentBracketSeeding;
    swissPairing?: TournamentSwissPairing;
    pacing?: TournamentPhasePacing;
    intervalHours?: number;
    deadlineResolution?: TournamentDeadlineResolution;
    statsPresetKey?: string;
    scenarios?: TournamentScenario[];
    plannedRounds?: number;
    topCut?: number;
    minPlayersPerMatch?: number;
    maxPlayersPerMatch?: number;
    order?: number;
  }
): Promise<TournamentPhase> {
  const _id = parseObjectId(tournamentId, "Tournoi");

  const minPlayersPerMatch = data.minPlayersPerMatch ?? 2;
  const maxPlayersPerMatch = data.maxPlayersPerMatch ?? 2;
  assertPlayerBoundsForType(data.type, minPlayersPerMatch, maxPlayersPerMatch);

  let order = data.order;
  if (order === undefined) {
    const last = await db
      .collection<TournamentPhaseDb>(PHASES)
      .find({ tournamentId: _id })
      .sort({ order: -1 })
      .limit(1)
      .toArray();
    order = last.length > 0 ? last[0].order + 1 : 0;
  }

  const doc: TournamentPhaseDb = {
    tournamentId: _id,
    name: data.name,
    type: data.type,
    bestOf: data.bestOf ?? 1,
    resultMode: data.resultMode ?? "selection",
    scoringMethod: data.scoringMethod ?? "fixed",
    fixedScoring: data.fixedScoring ?? DEFAULT_FIXED_SCORING,
    rankOffsets: data.rankOffsets ?? DEFAULT_RANK_OFFSETS,
    eliminationSeeding: data.eliminationSeeding ?? "standings",
    bracketSeeding: data.bracketSeeding ?? "opposite",
    swissPairing: data.swissPairing ?? "ranked",
    pacing: data.pacing ?? "live",
    intervalHours: data.intervalHours ?? DEFAULT_INTERVAL_HOURS,
    deadlineResolution: data.deadlineResolution ?? "double-loss",
    statsPresetKey: data.statsPresetKey,
    scenarios: data.scenarios,
    plannedRounds: data.plannedRounds,
    topCut: data.topCut,
    minPlayersPerMatch,
    maxPlayersPerMatch,
    order,
    status: "not-started",
    createdAt: new Date(),
  };

  const result = await db.collection<TournamentPhaseDb>(PHASES).insertOne(doc);
  return toPhase({ ...doc, _id: result.insertedId });
}

export async function updatePhase(
  tournamentId: string,
  phaseId: string,
  updates: {
    name?: string;
    type?: TournamentPhase["type"];
    bestOf?: number;
    resultMode?: TournamentResultMode;
    scoringMethod?: TournamentScoringMethod;
    fixedScoring?: TournamentFixedScoring;
    rankOffsets?: number[];
    eliminationSeeding?: TournamentEliminationSeeding;
    bracketSeeding?: TournamentBracketSeeding;
    swissPairing?: TournamentSwissPairing;
    pacing?: TournamentPhasePacing;
    intervalHours?: number;
    deadlineResolution?: TournamentDeadlineResolution;
    statsPresetKey?: string | null;
    scenarios?: TournamentScenario[] | null;
    plannedRounds?: number | null;
    topCut?: number | null;
    minPlayersPerMatch?: number;
    maxPlayersPerMatch?: number;
    order?: number;
    status?: TournamentPhase["status"];
  }
): Promise<TournamentPhase> {
  const phase = await getPhaseById(tournamentId, phaseId);
  if (!phase) {
    throw new TournamentError("not-found", "Phase non trouvée");
  }

  if (updates.type !== undefined && updates.type !== phase.type && phase.status !== "not-started") {
    throw new TournamentError("conflict", "Le type de phase ne peut pas être modifié une fois la phase démarrée");
  }

  // Valide les bornes de joueurs résultantes contre le type résultant.
  const nextType = updates.type ?? phase.type;
  const nextMin = updates.minPlayersPerMatch ?? phase.minPlayersPerMatch;
  const nextMax = updates.maxPlayersPerMatch ?? phase.maxPlayersPerMatch;
  if (
    updates.type !== undefined ||
    updates.minPlayersPerMatch !== undefined ||
    updates.maxPlayersPerMatch !== undefined
  ) {
    assertPlayerBoundsForType(nextType, nextMin, nextMax);
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  if (updates.name !== undefined) set.name = updates.name;
  if (updates.type !== undefined) set.type = updates.type;
  if (updates.bestOf !== undefined) set.bestOf = updates.bestOf;
  if (updates.resultMode !== undefined) set.resultMode = updates.resultMode;
  if (updates.scoringMethod !== undefined) set.scoringMethod = updates.scoringMethod;
  if (updates.fixedScoring !== undefined) set.fixedScoring = updates.fixedScoring;
  if (updates.rankOffsets !== undefined) set.rankOffsets = updates.rankOffsets;
  if (updates.eliminationSeeding !== undefined) set.eliminationSeeding = updates.eliminationSeeding;
  if (updates.bracketSeeding !== undefined) set.bracketSeeding = updates.bracketSeeding;
  if (updates.swissPairing !== undefined) set.swissPairing = updates.swissPairing;
  if (updates.pacing !== undefined) set.pacing = updates.pacing;
  if (updates.intervalHours !== undefined) set.intervalHours = updates.intervalHours;
  if (updates.deadlineResolution !== undefined) set.deadlineResolution = updates.deadlineResolution;
  if (updates.statsPresetKey === null) {
    unset.statsPresetKey = "";
  } else if (updates.statsPresetKey !== undefined) {
    set.statsPresetKey = updates.statsPresetKey;
  }
  if (updates.scenarios === null) {
    unset.scenarios = "";
  } else if (updates.scenarios !== undefined) {
    set.scenarios = updates.scenarios;
  }
  if (updates.plannedRounds === null) {
    unset.plannedRounds = "";
  } else if (updates.plannedRounds !== undefined) {
    set.plannedRounds = updates.plannedRounds;
  }
  if (updates.topCut === null) {
    unset.topCut = "";
  } else if (updates.topCut !== undefined) {
    set.topCut = updates.topCut;
  }
  if (updates.minPlayersPerMatch !== undefined) set.minPlayersPerMatch = updates.minPlayersPerMatch;
  if (updates.maxPlayersPerMatch !== undefined) set.maxPlayersPerMatch = updates.maxPlayersPerMatch;
  if (updates.order !== undefined) set.order = updates.order;
  if (updates.status !== undefined) set.status = updates.status;

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length > 0) update.$set = set;
  if (Object.keys(unset).length > 0) update.$unset = unset;
  if (Object.keys(update).length === 0) return phase;

  const result = await db.collection<TournamentPhaseDb>(PHASES).findOneAndUpdate(
    { _id: new ObjectId(phaseId), tournamentId: new ObjectId(tournamentId) },
    update,
    { returnDocument: "after" }
  );

  if (!result) {
    throw new TournamentError("not-found", "Phase non trouvée");
  }
  return toPhase(result);
}

export async function deletePhase(tournamentId: string, phaseId: string): Promise<void> {
  const phase = await getPhaseById(tournamentId, phaseId);
  if (!phase) {
    throw new TournamentError("not-found", "Phase non trouvée");
  }
  if (phase.status !== "not-started") {
    throw new TournamentError("conflict", "Impossible de supprimer une phase déjà démarrée ou terminée");
  }

  const tId = new ObjectId(tournamentId);
  const pId = new ObjectId(phaseId);
  await db.collection<TournamentPhaseDb>(PHASES).deleteOne({ _id: pId, tournamentId: tId });
  await db.collection(ROUNDS).deleteMany({ tournamentId: tId, phaseId: pId });
  await db.collection(MATCHES).deleteMany({ tournamentId: tId, phaseId: pId });
  await db
    .collection<TournamentDb>(TOURNAMENTS)
    .updateOne({ _id: tId, currentPhaseId: phaseId }, { $unset: { currentPhaseId: "" } });
}

// =====================
// ROUNDS
// =====================

export async function listRounds(tournamentId: string, phaseId?: string): Promise<TournamentRound[]> {
  const _id = parseObjectId(tournamentId, "Tournoi");
  const filter: Record<string, unknown> = { tournamentId: _id };
  if (phaseId) {
    filter.phaseId = parseObjectId(phaseId, "Phase");
  }
  const docs = await db
    .collection<TournamentRoundDb>(ROUNDS)
    .find(filter)
    .sort({ number: 1 })
    .toArray();
  return docs.map(toRound);
}

export async function getRoundById(tournamentId: string, roundId: string): Promise<TournamentRound | null> {
  if (!ObjectId.isValid(tournamentId) || !ObjectId.isValid(roundId)) return null;
  const doc = await db.collection<TournamentRoundDb>(ROUNDS).findOne({
    _id: new ObjectId(roundId),
    tournamentId: new ObjectId(tournamentId),
  });
  return doc ? toRound(doc) : null;
}

async function listPhaseMatches(tournamentId: ObjectId, phaseId: ObjectId): Promise<TournamentMatch[]> {
  // Tiebreak sur _id : les matchs d'une même ronde partagent le même createdAt
  // (insertMany), l'_id garantit l'ordre d'insertion (ordre du bracket).
  const docs = await db
    .collection<TournamentMatchDb>(MATCHES)
    .find({ tournamentId, phaseId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return docs.map(toMatch);
}

export async function listMatchesByPhase(
  tournamentId: string,
  phaseId: string
): Promise<TournamentMatch[]> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const pId = parseObjectId(phaseId, "Phase");
  return listPhaseMatches(tId, pId);
}

/** Tous les matchs du tournoi, toutes phases et rondes confondues (export, impression). */
export async function listMatchesByTournament(tournamentId: string): Promise<TournamentMatch[]> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const docs = await db
    .collection<TournamentMatchDb>(MATCHES)
    .find({ tournamentId: tId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return docs.map(toMatch);
}

// Borne supérieure des numéros de table, alignée sur les validations (schéma
// Zod et inputs UI) : au-delà, un match reste simplement sans table.
const MAX_TABLE_NUMBER = 9999;

/**
 * Attribue les numéros de table d'une série de matchs (groupes de joueurs) :
 * les tables fixes des joueurs priment (choix aléatoire si plusieurs joueurs à
 * table fixe se rencontrent), les autres matchs prennent les numéros
 * séquentiels à partir de `firstTable` en sautant les numéros déjà pris.
 * Les BYE (1 joueur) n'ont pas de table.
 */
function assignTableNumbers(
  groups: string[][],
  playersById: Map<string, TournamentPlayer>,
  firstTable: number,
  alreadyUsed: Iterable<number> = []
): (number | undefined)[] {
  const used = new Set<number>(alreadyUsed);
  const tables: (number | undefined)[] = new Array(groups.length).fill(undefined);

  // 1er passage : tables fixes des joueurs. Une table fixe déjà attribuée à un
  // autre match de la ronde n'est pas réutilisée (pas de doublon) : le match
  // retombe alors sur la numérotation séquentielle.
  groups.forEach((group, i) => {
    if (group.length === 1) return;
    const fixed = group
      .map((playerId) => playersById.get(playerId)?.fixedTableNumber)
      .filter((n): n is number => typeof n === "number" && !used.has(n));
    if (fixed.length > 0) {
      const table = fixed[Math.floor(Math.random() * fixed.length)];
      tables[i] = table;
      used.add(table);
    }
  });

  // 2e passage : numérotation séquentielle en sautant les tables prises,
  // bornée à MAX_TABLE_NUMBER (au-delà, pas de table).
  let next = firstTable;
  groups.forEach((group, i) => {
    if (group.length === 1 || tables[i] !== undefined) return;
    while (used.has(next)) next++;
    if (next > MAX_TABLE_NUMBER) return;
    tables[i] = next;
    used.add(next);
  });

  return tables;
}

/**
 * Scénario attribué à une ronde : le pool de la phase est parcouru dans l'ordre
 * et recommence au début s'il y a plus de rondes que de scénarios (une ligue
 * peut tourner sur trois missions pendant six intervalles).
 */
function scenarioForRound(phase: TournamentPhase, roundNumber: number): TournamentScenario | undefined {
  const scenarios = phase.scenarios;
  if (!scenarios || scenarios.length === 0) return undefined;
  return scenarios[(roundNumber - 1) % scenarios.length];
}

/**
 * Crée la ronde suivante d'une phase, avec génération automatique des matchs
 * (pairings suisses ou bracket). Pour une phase freeform, crée une ronde vide
 * dans laquelle l'organisateur ajoute ses matchs manuellement.
 */
export async function createNextRound(
  tournamentId: string,
  phaseId: string,
  createdBy: string
): Promise<{ round: TournamentRound; matches: TournamentMatch[] }> {
  const tId = parseObjectId(tournamentId, "Tournoi");

  const phase = await getPhaseById(tournamentId, phaseId);
  if (!phase) {
    throw new TournamentError("not-found", "Phase non trouvée");
  }
  if (phase.status === "completed") {
    throw new TournamentError("conflict", "Cette phase est terminée");
  }
  const pId = new ObjectId(phaseId);

  const existingRounds = await listRounds(tournamentId, phaseId);
  const lastRound = existingRounds[existingRounds.length - 1];
  const roundNumber = (lastRound?.number ?? 0) + 1;

  const phaseMatches = await listPhaseMatches(tId, pId);

  // La ronde précédente doit être terminée (tous ses matchs "completed").
  if (lastRound) {
    const lastRoundMatches = phaseMatches.filter((m) => m.roundId === lastRound.id);
    const allCompleted = lastRoundMatches.every((m) => m.status === "completed");
    if (!allCompleted) {
      throw new TournamentError(
        "conflict",
        `Tous les matchs de la ronde ${lastRound.number} doivent être terminés avant de créer la ronde suivante`
      );
    }
  }

  if (phase.plannedRounds && roundNumber > phase.plannedRounds) {
    throw new TournamentError("conflict", `Toutes les rondes (${phase.plannedRounds}) ont déjà été créées`);
  }

  const players = await listPlayers(tournamentId);
  const activePlayerIds = players.filter((p) => p.status === "registered").map((p) => p.id);
  const activeSet = new Set(activePlayerIds);

  const minPlayers = phase.minPlayersPerMatch;
  const maxPlayers = phase.maxPlayersPerMatch;

  // Classement cumulé sur tout le tournoi (toutes phases), chaque match scoré
  // selon sa propre phase : les points des phases précédentes sont conservés et
  // pris en compte pour l'appariement, le seeding et la qualification top cut.
  const allPhases = await listPhases(tournamentId);
  const scoringByPhaseId = new Map(allPhases.map((p) => [p.id, scoringForPhase(p)]));
  const allMatches = (
    await db.collection<TournamentMatchDb>(MATCHES).find({ tournamentId: tId }).toArray()
  ).map(toMatch);
  const phasePreset = getPreset(phase.statsPresetKey);
  const cumulativeStandings = (ids: string[]): PlayerStanding[] =>
    calculateMultiplayerStandings(
      ids,
      allMatches,
      (match) => scoringByPhaseId.get(match.phaseId) ?? scoringForPhase(phase),
      phasePreset
    );
  const cumulativeRank = (ids: string[]): string[] =>
    cumulativeStandings(ids).map((s) => s.playerId);

  // Joueurs déjà exemptés au moins une fois : le BYE va en priorité à ceux qui
  // n'en ont pas encore eu. Les BYE de toutes les phases comptent — un joueur
  // exempté en phase suisse ne doit pas l'être à nouveau juste après.
  const playersWithBye = new Set(
    allMatches.filter((m) => m.players.length === 1).map((m) => m.players[0].playerId)
  );

  // Chaque groupe = les joueurs d'un match à créer ; un groupe de taille 1
  // est un BYE. Uniformise pairings 2-joueurs (bracket, suisse en duel) et
  // pods multijoueurs (suisse/élimination).
  const pairingsToGroups = (pairings: PairingResult[]): string[][] =>
    pairings.map((p) => (p.player2Id === null ? [p.player1Id] : [p.player1Id, p.player2Id]));

  // Ordonne un ensemble de joueurs pour l'appariement : soit aléatoirement,
  // soit selon le classement cumulé multi-phases.
  const orderPlayers = (ids: string[], seeding: TournamentEliminationSeeding): string[] =>
    seeding === "random" ? shuffleArray([...ids]) : cumulativeRank(ids);

  // Ensemble qualifié à l'entrée de la phase : classé par le classement cumulé
  // (points de toutes les phases précédentes), puis limité au top cut éventuel.
  const qualifiedEntryPlayers = (): string[] => {
    const ranked = cumulativeRank(activePlayerIds);
    return phase.topCut && phase.topCut < ranked.length ? ranked.slice(0, phase.topCut) : ranked;
  };

  let groups: string[][] = [];

  if (phase.type === "swiss") {
    // Champ de la phase : ensemble qualifié en ronde 1, puis les participants
    // encore actifs pour les rondes suivantes.
    const field = lastRound
      ? [...new Set(phaseMatches.flatMap((m) => m.players.map((p) => p.playerId)))].filter((id) =>
          activeSet.has(id)
        )
      : qualifiedEntryPlayers();
    if (field.length < minPlayers) {
      throw new TournamentError("invalid", `Au moins ${minPlayers} joueurs actifs sont requis`);
    }
    if (minPlayers === 2 && maxPlayers === 2) {
      // Duel : appariement suisse classique (évitement des re-matchs sur la
      // phase, ordre de classement cumulé multi-phases). En mode
      // « random-in-bracket », les points cumulés servent à constituer les
      // groupes dans lesquels l'appariement est tiré au sort.
      const standings = cumulativeStandings(field);
      const matchPointsById = new Map(standings.map((s) => [s.playerId, s.matchPoints]));
      groups = pairingsToGroups(
        generateSwissPairings(field, phaseMatches.map(toPairingMatch), roundNumber, {
          rankedOrder: standings.map((s) => s.playerId),
          mode: phase.swissPairing,
          matchPointsOf: (playerId) => matchPointsById.get(playerId) ?? 0,
          playersWithBye,
        })
      );
    } else {
      // Pods multijoueurs : ordre aléatoire en ronde 1, sinon par classement.
      const ordered = roundNumber === 1 ? shuffleArray([...field]) : orderPlayers(field, "standings");
      groups = chunkIntoPods(ordered, minPlayers, maxPlayers);
    }
  } else if (phase.type === "elimination") {
    // Seuls les vainqueurs de la ronde précédente avancent ; ré-appariement
    // selon le classement ou aléatoire (eliminationSeeding).
    let field: string[];
    if (lastRound) {
      const lastRoundMatches = phaseMatches.filter((m) => m.roundId === lastRound.id);
      field = [...new Set(lastRoundMatches.flatMap((m) => m.winnerIds))].filter((id) => activeSet.has(id));
      if (field.length <= 1) {
        throw new TournamentError("conflict", "Un seul joueur reste en lice : la phase est terminée");
      }
    } else {
      field = qualifiedEntryPlayers();
      if (field.length < 2) {
        throw new TournamentError("invalid", "Au moins 2 joueurs actifs sont requis");
      }
    }
    groups = chunkIntoPods(orderPlayers(field, phase.eliminationSeeding), minPlayers, maxPlayers);
  } else if (phase.type === "bracket") {
    // Bracket : arbre figé, strictement 2 joueurs (assertPlayerBoundsForType).
    if (lastRound) {
      const lastRoundMatches = phaseMatches.filter((m) => m.roundId === lastRound.id);
      if (lastRoundMatches.length === 1) {
        throw new TournamentError("conflict", "La finale a déjà été jouée, le bracket est complet");
      }
      groups = pairingsToGroups(generateNextBracketRound(lastRoundMatches.map(toPairingMatch)));
    } else {
      // Première ronde : seedée sur l'ordre qualifié d'entrée (top cut inclus),
      // appariée selon la règle configurée sur la phase (bracketSeeding) :
      // classement opposé (1er vs dernier), rapproché (1er vs 2e) ou aléatoire
      // (ordre mélangé puis appariement deux à deux).
      const seededField = qualifiedEntryPlayers();
      if (seededField.length < 2) {
        throw new TournamentError("invalid", "Au moins 2 joueurs actifs sont requis");
      }
      // En aléatoire, tout est tiré au sort : l'ordre d'entrée est entièrement
      // mélangé, y compris l'attribution des BYE d'un bracket incomplet.
      const entryOrder =
        phase.bracketSeeding === "random" ? shuffleArray([...seededField]) : seededField;
      groups = pairingsToGroups(
        generateEliminationBracket(
          entryOrder,
          [],
          undefined,
          phase.bracketSeeding === "opposite" ? "opposite" : "adjacent"
        )
      );
    }
  }
  // freeform: pas de génération, la ronde est créée vide.

  const now = new Date();
  const isAsync = phase.pacing === "asynchronous";
  const scenario = scenarioForRound(phase, roundNumber);
  const roundDoc: TournamentRoundDb = {
    tournamentId: tId,
    phaseId: pId,
    number: roundNumber,
    status: "in-progress",
    // Intervalle de jeu : la ronde s'ouvre à sa création et court jusqu'à
    // l'échéance. En direct, c'est le minuteur du tournoi qui rythme la ronde.
    ...(isAsync
      ? {
          opensAt: now,
          deadlineAt: DateTime.fromJSDate(now).plus({ hours: phase.intervalHours }).toJSDate(),
        }
      : {}),
    ...(scenario ? { scenario } : {}),
    createdAt: now,
  };
  await roundsIndexReady;
  let roundResult;
  try {
    roundResult = await db.collection<TournamentRoundDb>(ROUNDS).insertOne(roundDoc);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new TournamentError(
        "conflict",
        `La ronde ${roundNumber} existe déjà pour cette phase (création concurrente)`
      );
    }
    throw error;
  }
  const round = toRound({ ...roundDoc, _id: roundResult.insertedId });

  // Numéros de table : tables fixes des joueurs, puis séquence à partir du
  // numéro de première table configuré sur le tournoi. Une ronde asynchrone
  // n'en a pas : les joueurs se retrouvent où ils veulent, quand ils veulent.
  const tournamentForTables = await requireTournament(tournamentId);
  const playersById = new Map(players.map((p) => [p.id, p]));
  const tableNumbers = isAsync
    ? groups.map(() => undefined)
    : assignTableNumbers(
        groups,
        playersById,
        tournamentForTables.settings.firstTableNumber ?? 1
      );

  const matchDocs: TournamentMatchDb[] = groups.map((group, i) => {
    const isBye = group.length === 1;
    const matchPlayers: TournamentMatchPlayer[] = group.map((playerId) => ({
      playerId,
      score: isBye ? byeWinScore(phase.bestOf) : 0,
    }));
    return {
      tournamentId: tId,
      phaseId: pId,
      roundId: roundResult.insertedId,
      players: matchPlayers,
      games: [],
      winnerIds: isBye ? [group[0]] : [],
      bracketPosition: phase.type === "bracket" ? generateBracketPosition(i, groups.length) : undefined,
      tableNumber: tableNumbers[i],
      status: isBye ? "completed" : "pending",
      reportedBy: isBye ? createdBy : undefined,
      confirmedBy: isBye ? createdBy : undefined,
      createdAt: now,
    };
  });

  let matches: TournamentMatch[] = [];
  if (matchDocs.length > 0) {
    const inserted = await db.collection<TournamentMatchDb>(MATCHES).insertMany(matchDocs);
    matches = matchDocs.map((doc, i) => toMatch({ ...doc, _id: inserted.insertedIds[i] }));
  }

  // Démarrer la phase automatiquement à la première ronde.
  if (phase.status === "not-started") {
    await updatePhase(tournamentId, phaseId, { status: "in-progress" });
  }

  return { round, matches };
}

export async function deleteRound(tournamentId: string, roundId: string): Promise<void> {
  const round = await getRoundById(tournamentId, roundId);
  if (!round) {
    throw new TournamentError("not-found", "Ronde non trouvée");
  }

  // Seule la dernière ronde d'une phase peut être supprimée, sinon les
  // pairings des rondes suivantes deviendraient incohérents.
  const rounds = await listRounds(tournamentId, round.phaseId);
  const lastRound = rounds[rounds.length - 1];
  if (lastRound.id !== round.id) {
    throw new TournamentError("conflict", "Seule la dernière ronde d'une phase peut être supprimée");
  }

  const tId = new ObjectId(tournamentId);
  const rId = new ObjectId(roundId);
  await db.collection(MATCHES).deleteMany({ tournamentId: tId, roundId: rId });
  await db.collection(ROUNDS).deleteOne({ _id: rId, tournamentId: tId });
}

/**
 * Rouvre une ronde terminée (organisateur) : la repasse « en cours » pour en
 * redevenir la ronde courante et permettre la correction des résultats. Le
 * classement figé éventuel est conservé (l'organisateur peut le recalculer
 * après avoir re-clôturé la ronde).
 */
export async function reopenRound(tournamentId: string, roundId: string): Promise<TournamentRound> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const rId = parseObjectId(roundId, "Ronde");

  const round = await getRoundById(tournamentId, roundId);
  if (!round) {
    throw new TournamentError("not-found", "Ronde non trouvée");
  }
  if (round.status !== "completed") {
    throw new TournamentError("conflict", "Cette ronde est déjà en cours");
  }

  const phases = await listPhases(tournamentId);
  const phaseIndex = phases.findIndex((p) => p.id === round.phaseId);
  if (phaseIndex === -1) {
    throw new TournamentError("not-found", "Phase non trouvée");
  }
  const phase = phases[phaseIndex];

  // Seule la dernière ronde d'une phase peut être rouverte : rouvrir une ronde
  // antérieure rendrait « la ronde courante » ambiguë et incohérents les
  // pairings/classements des rondes suivantes.
  const phaseRounds = await listRounds(tournamentId, round.phaseId);
  const lastRound = phaseRounds[phaseRounds.length - 1];
  if (!lastRound || lastRound.id !== round.id) {
    throw new TournamentError(
      "conflict",
      "Seule la dernière ronde d'une phase peut être rouverte"
    );
  }

  // Annulation complète des phases démarrées après celle-ci : on repasse la
  // phase rouverte « ouverte » (ronde courante), et chaque phase quittée
  // redevient « à venir » — ses rondes/matchs sont supprimés et les joueurs
  // qu'elle avait éliminés par top cut sont restaurés en « registered ». Toutes
  // ces écritures (multi-collections) sont regroupées dans une transaction pour
  // éviter un état partiellement annulé en cas d'échec intermédiaire.
  const subsequentStarted = phases.filter((p, i) => i > phaseIndex && p.status !== "not-started");

  const session = db.client.startSession();
  let reopened: WithId<TournamentRoundDb> | null = null;
  try {
    await session.withTransaction(async () => {
      for (const later of subsequentStarted) {
        const laterId = new ObjectId(later.id);
        if (later.entryDroppedPlayerIds && later.entryDroppedPlayerIds.length > 0) {
          await db.collection<TournamentPlayerDb>(PLAYERS).updateMany(
            {
              _id: { $in: later.entryDroppedPlayerIds.map((id) => new ObjectId(id)) },
              tournamentId: tId,
              status: "dropped",
            },
            { $set: { status: "registered" } },
            { session }
          );
        }
        await db.collection(MATCHES).deleteMany({ tournamentId: tId, phaseId: laterId }, { session });
        await db.collection(ROUNDS).deleteMany({ tournamentId: tId, phaseId: laterId }, { session });
        await db
          .collection<TournamentPhaseDb>(PHASES)
          .updateOne(
            { _id: laterId, tournamentId: tId },
            { $set: { status: "not-started" }, $unset: { entryDroppedPlayerIds: "" } },
            { session }
          );
      }

      reopened = await db.collection<TournamentRoundDb>(ROUNDS).findOneAndUpdate(
        { _id: rId, tournamentId: tId, status: "completed" },
        { $set: { status: "in-progress" }, $unset: { completedAt: "" } },
        { returnDocument: "after", session }
      );
      if (!reopened) {
        throw new TournamentError("not-found", "Ronde non trouvée");
      }

      // La phase de la ronde rouverte redevient « ouverte » et la phase courante.
      if (phase.status !== "in-progress") {
        await db
          .collection<TournamentPhaseDb>(PHASES)
          .updateOne(
            { _id: new ObjectId(phase.id), tournamentId: tId },
            { $set: { status: "in-progress" } },
            { session }
          );
      }
      if (subsequentStarted.length > 0) {
        await db
          .collection<TournamentDb>(TOURNAMENTS)
          .updateOne({ _id: tId }, { $set: { currentPhaseId: phase.id } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  if (!reopened) {
    throw new TournamentError("not-found", "Ronde non trouvée");
  }
  return toRound(reopened);
}

async function completeRoundIfAllMatchesDone(tournamentId: ObjectId, roundId: ObjectId): Promise<void> {
  const remaining = await db.collection<TournamentMatchDb>(MATCHES).findOne({
    tournamentId,
    roundId,
    status: { $ne: "completed" },
  });
  if (!remaining) {
    await db.collection<TournamentRoundDb>(ROUNDS).updateOne(
      { _id: roundId, tournamentId, status: { $ne: "completed" } },
      { $set: { status: "completed", completedAt: new Date() } }
    );
  } else {
    // Un résultat a pu être invalidé (dispute) après complétion : rouvrir la ronde.
    await db.collection<TournamentRoundDb>(ROUNDS).updateOne(
      { _id: roundId, tournamentId, status: "completed" },
      { $set: { status: "in-progress" }, $unset: { completedAt: "" } }
    );
  }
}

/**
 * Déplace l'échéance d'un intervalle. Le document de ligue autorise
 * explicitement l'organisateur à accorder du temps supplémentaire quand des
 * joueurs n'ont pas pu se rencontrer ; c'est le geste qui l'implémente.
 * `deadlineAt` à null retire l'échéance (l'intervalle court alors sans limite).
 */
export async function setRoundDeadline(
  tournamentId: string,
  roundId: string,
  deadlineAt: Date | null
): Promise<TournamentRound> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const rId = parseObjectId(roundId, "Ronde");

  const result = await db.collection<TournamentRoundDb>(ROUNDS).findOneAndUpdate(
    { _id: rId, tournamentId: tId },
    deadlineAt
      ? // Repousser l'échéance relance le cycle de relances : la relance déjà
        // envoyée portait sur l'ancienne date et n'a plus lieu d'être.
        { $set: { deadlineAt }, $unset: { remindersSentAt: "" } }
      : { $unset: { deadlineAt: "", remindersSentAt: "" } },
    { returnDocument: "after" }
  );
  if (!result) {
    throw new TournamentError("not-found", "Ronde non trouvée");
  }
  return toRound(result);
}

/**
 * Rondes asynchrones encore ouvertes dont l'échéance approche ou est dépassée,
 * avec les matchs restés sans résultat. Alimente le cron de relance : c'est la
 * seule lecture transverse à tous les tournois, d'où le filtre sur `deadlineAt`
 * plutôt qu'un balayage complet.
 */
export async function listRoundsNeedingDeadlineNotice(
  before: Date
): Promise<{ round: TournamentRound; pendingMatches: TournamentMatch[] }[]> {
  const roundDocs = await db
    .collection<TournamentRoundDb>(ROUNDS)
    .find({ status: "in-progress", deadlineAt: { $lte: before }, remindersSentAt: { $exists: false } })
    .sort({ deadlineAt: 1 })
    .limit(200)
    .toArray();

  const rounds = roundDocs.map(toRound);
  if (rounds.length === 0) return [];

  const pendingDocs = await db
    .collection<TournamentMatchDb>(MATCHES)
    .find({
      roundId: { $in: roundDocs.map((doc) => doc._id) },
      status: { $ne: "completed" },
    })
    .toArray();
  const pendingByRoundId = new Map<string, TournamentMatch[]>();
  for (const doc of pendingDocs) {
    const key = doc.roundId.toString();
    const list = pendingByRoundId.get(key);
    if (list) list.push(toMatch(doc));
    else pendingByRoundId.set(key, [toMatch(doc)]);
  }

  return rounds
    .map((round) => ({ round, pendingMatches: pendingByRoundId.get(round.id) ?? [] }))
    .filter((entry) => entry.pendingMatches.length > 0);
}

/** Marque une ronde comme relancée, pour ne pas renvoyer le même message. */
export async function markRoundReminded(roundId: string): Promise<void> {
  await db
    .collection<TournamentRoundDb>(ROUNDS)
    .updateOne({ _id: parseObjectId(roundId, "Ronde") }, { $set: { remindersSentAt: new Date() } });
}

/** Change (ou retire) le scénario joué pendant une ronde. */
export async function setRoundScenario(
  tournamentId: string,
  roundId: string,
  scenario: TournamentScenario | null
): Promise<TournamentRound> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const rId = parseObjectId(roundId, "Ronde");

  const result = await db.collection<TournamentRoundDb>(ROUNDS).findOneAndUpdate(
    { _id: rId, tournamentId: tId },
    scenario ? { $set: { scenario } } : { $unset: { scenario: "" } },
    { returnDocument: "after" }
  );
  if (!result) {
    throw new TournamentError("not-found", "Ronde non trouvée");
  }
  return toRound(result);
}

/**
 * Clôt un intervalle : applique la règle de la phase aux matchs encore ouverts,
 * puis termine la ronde.
 *
 * En `double-loss` (règle par défaut des ligues), les deux joueurs d'un match
 * non joué perdent. La ronde est ensuite fermée par
 * `completeRoundIfAllMatchesDone`, comme après le dernier résultat rentré.
 *
 * En `manual`, rien n'est appliqué : la fonction se contente de constater qu'il
 * reste des matchs ouverts et le dit — l'organisateur tranche match par match
 * (forfait d'un côté, prolongation, résultat saisi à la main).
 */
export async function closeRoundOnDeadline(
  tournamentId: string,
  roundId: string
): Promise<{ round: TournamentRound; resolvedMatchIds: string[] }> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const rId = parseObjectId(roundId, "Ronde");

  const round = await getRoundById(tournamentId, roundId);
  if (!round) {
    throw new TournamentError("not-found", "Ronde non trouvée");
  }
  if (round.status === "completed") {
    throw new TournamentError("conflict", "Cette ronde est déjà terminée");
  }

  const phase = await getPhaseById(tournamentId, round.phaseId);
  if (!phase) {
    throw new TournamentError("not-found", "Phase non trouvée");
  }

  const openMatches = (
    await db
      .collection<TournamentMatchDb>(MATCHES)
      .find({ tournamentId: tId, roundId: rId, status: { $ne: "completed" } })
      .toArray()
  ).map(toMatch);

  // Un match rapporté mais pas encore confirmé, ou contesté, porte un résultat :
  // la clôture ne doit jamais l'écraser. L'organisateur tranche d'abord.
  const awaitingArbitration = openMatches.filter((m) => m.status !== "pending");
  if (awaitingArbitration.length > 0) {
    throw new TournamentError(
      "conflict",
      `${awaitingArbitration.length} match(s) attendent une confirmation ou un arbitrage : traitez-les avant de clore l'intervalle`
    );
  }

  const unplayedMatches = openMatches.filter((m) => m.status === "pending");
  if (phase.deadlineResolution === "manual") {
    if (unplayedMatches.length > 0) {
      throw new TournamentError(
        "conflict",
        `${unplayedMatches.length} match(s) sans résultat : renseignez-les ou accordez un forfait avant de clore l'intervalle`
      );
    }
  } else if (unplayedMatches.length > 0) {
    await db.collection<TournamentMatchDb>(MATCHES).updateMany(
      { tournamentId: tId, roundId: rId, status: "pending" },
      {
        $set: {
          status: "completed",
          resolution: "double-loss",
          winnerIds: [],
          games: [],
          updatedAt: new Date(),
        },
      }
    );
  }

  await completeRoundIfAllMatchesDone(tId, rId);

  const closed = await getRoundById(tournamentId, roundId);
  if (!closed) {
    throw new TournamentError("not-found", "Ronde non trouvée");
  }
  return { round: closed, resolvedMatchIds: unplayedMatches.map((m) => m.id) };
}

// =====================
// MATCHES
// =====================

export async function listMatchesByRound(tournamentId: string, roundId: string): Promise<TournamentMatch[]> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const rId = parseObjectId(roundId, "Ronde");
  const docs = await db
    .collection<TournamentMatchDb>(MATCHES)
    .find({ tournamentId: tId, roundId: rId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return docs.map(toMatch);
}

export async function getMatchById(tournamentId: string, matchId: string): Promise<TournamentMatch | null> {
  if (!ObjectId.isValid(tournamentId) || !ObjectId.isValid(matchId)) return null;
  const doc = await db.collection<TournamentMatchDb>(MATCHES).findOne({
    _id: new ObjectId(matchId),
    tournamentId: new ObjectId(tournamentId),
  });
  return doc ? toMatch(doc) : null;
}

/**
 * Ajout manuel d'un match dans une ronde : phases freeform, formats
 * multijoueurs (3+ joueurs, phases freeform uniquement), ou correction
 * exceptionnelle par un organisateur. Un seul joueur crée un BYE,
 * auto-complété avec le score de victoire du format de la phase.
 */
export async function createMatch(
  tournamentId: string,
  roundId: string,
  data: { players: string[]; bracketPosition?: string }
): Promise<TournamentMatch> {
  const round = await getRoundById(tournamentId, roundId);
  if (!round) {
    throw new TournamentError("not-found", "Ronde non trouvée");
  }

  const phase = await getPhaseById(tournamentId, round.phaseId);
  if (!phase) {
    throw new TournamentError("not-found", "Phase non trouvée");
  }

  // Hors freeform (où tout est permis), un match manuel respecte les bornes
  // de joueurs de la phase — un BYE (1 joueur) restant toujours autorisé.
  if (
    phase.type !== "freeform" &&
    data.players.length > 1 &&
    data.players.length > phase.maxPlayersPerMatch
  ) {
    throw new TournamentError(
      "invalid",
      `Les matchs de cette phase comptent au plus ${phase.maxPlayersPerMatch} joueurs`
    );
  }

  const tournamentPlayers = await listPlayers(tournamentId);
  const knownIds = new Set(tournamentPlayers.map((p) => p.id));
  for (const playerId of data.players) {
    if (!knownIds.has(playerId)) {
      throw new TournamentError("invalid", `Joueur ${playerId} non trouvé dans ce tournoi`);
    }
  }

  const isBye = data.players.length === 1;

  // Numéro de table : table fixe d'un des joueurs, sinon prochain numéro
  // libre de la ronde à partir de la première table configurée.
  const tournament = await requireTournament(tournamentId);
  const roundMatches = await listMatchesByRound(tournamentId, roundId);
  const [tableNumber] = assignTableNumbers(
    [data.players],
    new Map(tournamentPlayers.map((p) => [p.id, p])),
    tournament.settings.firstTableNumber ?? 1,
    roundMatches.map((m) => m.tableNumber).filter((n): n is number => typeof n === "number")
  );

  const doc: TournamentMatchDb = {
    tournamentId: new ObjectId(tournamentId),
    phaseId: new ObjectId(round.phaseId),
    roundId: new ObjectId(roundId),
    // Même score de BYE que les rondes générées, pour garder les
    // tie-breakers (gamesWon/gamesDiff) cohérents.
    players: data.players.map((playerId) => ({
      playerId,
      score: isBye ? byeWinScore(phase.bestOf) : 0,
    })),
    games: [],
    winnerIds: isBye ? [data.players[0]] : [],
    bracketPosition: data.bracketPosition,
    tableNumber,
    status: isBye ? "completed" : "pending",
    createdAt: new Date(),
  };

  const result = await db.collection<TournamentMatchDb>(MATCHES).insertOne(doc);
  return toMatch({ ...doc, _id: result.insertedId });
}

// Vérifie que l'acteur incarne un des joueurs du match.
function assertActorIsInMatch(match: TournamentMatch, actor: MatchActor): void {
  const isInMatch = match.players.some((p) => actor.playerIds.includes(p.playerId));
  if (!isInMatch) {
    throw new TournamentError("forbidden", "Vous ne faites pas partie de ce match");
  }
}

// Modification manuelle du numéro de table d'un match (gestionnaires).
// null retire le numéro.
export async function setMatchTable(
  tournamentId: string,
  matchId: string,
  tableNumber: number | null
): Promise<TournamentMatch> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const mId = parseObjectId(matchId, "Match");

  const update =
    tableNumber === null
      ? { $unset: { tableNumber: "" as const }, $set: { updatedAt: new Date() } }
      : { $set: { tableNumber, updatedAt: new Date() } };

  const result = await db
    .collection<TournamentMatchDb>(MATCHES)
    .findOneAndUpdate({ _id: mId, tournamentId: tId }, update, { returnDocument: "after" });
  if (!result) {
    throw new TournamentError("not-found", "Match non trouvé");
  }
  return toMatch(result);
}

// Prolongation accordée à une table (gestionnaires). `seconds` s'ajoute à la
// prolongation en cours ; 0 la retire. Le total est borné à zéro pour qu'une
// valeur négative ne puisse pas produire un temps de jeu négatif.
export async function extendMatch(
  tournamentId: string,
  matchId: string,
  seconds: number
): Promise<TournamentMatch> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const mId = parseObjectId(matchId, "Match");

  const match = await getMatchById(tournamentId, matchId);
  if (!match) {
    throw new TournamentError("not-found", "Match non trouvé");
  }
  const next = seconds === 0 ? 0 : Math.max(0, (match.extensionSeconds ?? 0) + seconds);

  const update =
    next === 0
      ? { $unset: { extensionSeconds: "" as const }, $set: { updatedAt: new Date() } }
      : { $set: { extensionSeconds: next, updatedAt: new Date() } };

  const result = await db
    .collection<TournamentMatchDb>(MATCHES)
    .findOneAndUpdate({ _id: mId, tournamentId: tId }, update, { returnDocument: "after" });
  if (!result) {
    throw new TournamentError("not-found", "Match non trouvé");
  }
  return toMatch(result);
}

export async function reportMatchResult(
  tournament: Tournament,
  matchId: string,
  data: { games: TournamentGameResult[] },
  actor: MatchActor
): Promise<TournamentMatch> {
  const match = await getMatchById(tournament.id, matchId);
  if (!match) {
    throw new TournamentError("not-found", "Match non trouvé");
  }
  if (match.players.length === 1) {
    throw new TournamentError("conflict", "Le résultat d'un BYE ne peut pas être modifié");
  }

  const phase = await getPhaseById(tournament.id, match.phaseId);
  if (!phase) {
    throw new TournamentError("not-found", "Phase non trouvée");
  }

  // Un joueur ne peut rapporter que son propre match, seulement si le
  // self-reporting est activé sur le tournoi, et pas sur un résultat déjà
  // acté (terminé ou contesté) : les corrections après coup passent par un
  // organisateur.
  if (!actor.isOrganizer) {
    if (!tournament.settings.allowSelfReporting) {
      throw new TournamentError("forbidden", "Le rapport de résultat par les joueurs est désactivé");
    }
    assertActorIsInMatch(match, actor);
    if (match.status === "completed" || match.status === "disputed") {
      throw new TournamentError(
        "conflict",
        "Ce résultat est déjà acté : seul un organisateur peut le modifier"
      );
    }
  }

  const matchPlayerIds = match.players.map((p) => p.playerId);
  const statKeys = presetStatKeys(getPreset(phase.statsPresetKey));

  // Au plus bestOf parties ; chaque partie ne concerne que des joueurs du match.
  if (data.games.length > phase.bestOf) {
    throw new TournamentError("invalid", `Un best-of-${phase.bestOf} compte au plus ${phase.bestOf} parties`);
  }
  for (const game of data.games) {
    if (game.winnerId != null && !matchPlayerIds.includes(game.winnerId)) {
      throw new TournamentError("invalid", "Le vainqueur d'une partie doit être un joueur du match");
    }
    if (game.stats) {
      if (statKeys.length === 0) {
        throw new TournamentError(
          "invalid",
          "Cette phase ne relève aucune statistique de match"
        );
      }
      for (const [playerId, playerStats] of Object.entries(game.stats)) {
        if (!matchPlayerIds.includes(playerId)) {
          throw new TournamentError("invalid", "Les statistiques doivent porter sur un joueur du match");
        }
        for (const key of Object.keys(playerStats)) {
          if (!statKeys.includes(key)) {
            throw new TournamentError("invalid", `Statistique inconnue pour cette phase : ${key}`);
          }
        }
      }
    }
    if (phase.resultMode === "points") {
      if (!game.points || !matchPlayerIds.every((id) => id in (game.points ?? {}))) {
        throw new TournamentError("invalid", "Les points de chaque joueur sont requis pour chaque partie");
      }
    } else if (!("winnerId" in game)) {
      // Mode selection : un vainqueur explicite (ou null pour une partie nulle)
      // est requis, pour éviter qu'une partie {} soit prise pour un nul.
      throw new TournamentError("invalid", "Le vainqueur (ou nul) de chaque partie doit être renseigné");
    }
  }

  // Déduit le vainqueur de chaque partie et le nombre de parties gagnées.
  const { normalizedGames, gamesWonByPlayer } = tallyGames(
    data.games,
    matchPlayerIds,
    phase.resultMode,
    statKeys
  );

  // Vainqueur(s) du match : joueur(s) ayant gagné le plus de parties ; égalité
  // générale (ou aucune partie gagnée) = match nul. Un résultat partiel est
  // accepté (tournois timés) : 1 partie jouée = le vainqueur gagne le match,
  // 2 parties 1-1 = égalité. Le seuil de victoires n'est pas exigé.
  const maxWins = Math.max(0, ...matchPlayerIds.map((id) => gamesWonByPlayer.get(id) ?? 0));
  const leaders = matchPlayerIds.filter((id) => (gamesWonByPlayer.get(id) ?? 0) === maxWins);
  const winnerIds = maxWins > 0 && leaders.length < matchPlayerIds.length ? leaders : [];

  const updatedPlayers: TournamentMatchPlayer[] = match.players.map((p) => ({
    playerId: p.playerId,
    score: gamesWonByPlayer.get(p.playerId) ?? 0,
  }));

  // Sans confirmation requise (ou pour un organisateur), le résultat est final.
  const needsConfirmation = tournament.settings.requireConfirmation && !actor.isOrganizer;

  const set: Record<string, unknown> = {
    players: updatedPlayers,
    games: normalizedGames,
    winnerIds,
    // Un résultat rapporté est toujours un match joué : cela remet aussi à
    // « joué » un match précédemment clos en forfait ou en double défaite.
    resolution: "played",
    reportedBy: actor.id,
    status: needsConfirmation ? "in-progress" : "completed",
    updatedAt: new Date(),
  };
  if (!needsConfirmation) {
    set.confirmedBy = actor.id;
  }

  const result = await db.collection<TournamentMatchDb>(MATCHES).findOneAndUpdate(
    { _id: new ObjectId(matchId), tournamentId: new ObjectId(tournament.id) },
    { $set: set },
    { returnDocument: "after" }
  );
  if (!result) {
    throw new TournamentError("not-found", "Match non trouvé");
  }

  await completeRoundIfAllMatchesDone(new ObjectId(tournament.id), new ObjectId(result.roundId.toString()));

  return toMatch(result);
}

export async function confirmMatchResult(
  tournament: Tournament,
  matchId: string,
  actor: MatchActor
): Promise<TournamentMatch> {
  const match = await getMatchById(tournament.id, matchId);
  if (!match) {
    throw new TournamentError("not-found", "Match non trouvé");
  }
  if (match.status !== "in-progress") {
    throw new TournamentError("conflict", "Ce match n'attend pas de confirmation");
  }

  if (!actor.isOrganizer) {
    // Compare reportedBy à toutes les identités de l'acteur (userId et ids
    // de joueur) : alterner session et clé de synchronisation ne permet pas
    // de confirmer son propre rapport.
    if (match.reportedBy && actor.identityIds.includes(match.reportedBy)) {
      throw new TournamentError("forbidden", "Vous ne pouvez pas confirmer votre propre rapport");
    }
    assertActorIsInMatch(match, actor);
  }

  const result = await db.collection<TournamentMatchDb>(MATCHES).findOneAndUpdate(
    { _id: new ObjectId(matchId), tournamentId: new ObjectId(tournament.id) },
    { $set: { confirmedBy: actor.id, status: "completed", updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!result) {
    throw new TournamentError("not-found", "Match non trouvé");
  }

  await completeRoundIfAllMatchesDone(new ObjectId(tournament.id), new ObjectId(result.roundId.toString()));

  return toMatch(result);
}

export async function disputeMatchResult(
  tournament: Tournament,
  matchId: string,
  actor: MatchActor
): Promise<TournamentMatch> {
  const match = await getMatchById(tournament.id, matchId);
  if (!match) {
    throw new TournamentError("not-found", "Match non trouvé");
  }

  if (!actor.isOrganizer) {
    assertActorIsInMatch(match, actor);
  }

  const result = await db.collection<TournamentMatchDb>(MATCHES).findOneAndUpdate(
    { _id: new ObjectId(matchId), tournamentId: new ObjectId(tournament.id) },
    { $set: { status: "disputed", updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!result) {
    throw new TournamentError("not-found", "Match non trouvé");
  }

  await completeRoundIfAllMatchesDone(new ObjectId(tournament.id), new ObjectId(result.roundId.toString()));

  return toMatch(result);
}

/**
 * Conclut un match sans qu'il ait été joué, à la main de l'arbitrage.
 *
 * `winnerId` renseigné : l'adversaire ne s'est pas présenté ou n'a pas répondu
 * aux sollicitations. Le vainqueur est crédité comme s'il avait reçu un BYE —
 * victoire nette du best-of et statistiques de bye du preset — ce que le
 * document de ligue demande explicitement (« scored as a bye »).
 *
 * `winnerId` à null : personne n'a joué, les deux joueurs perdent. C'est le cas
 * que `resolution: "double-loss"` distingue du match nul.
 */
export async function forfeitMatch(
  tournament: Tournament,
  matchId: string,
  data: { winnerId: string | null },
  actor: MatchActor
): Promise<TournamentMatch> {
  if (!actor.isOrganizer) {
    throw new TournamentError("forbidden", "Seul un organisateur peut prononcer un forfait");
  }

  const match = await getMatchById(tournament.id, matchId);
  if (!match) {
    throw new TournamentError("not-found", "Match non trouvé");
  }
  if (match.players.length === 1) {
    throw new TournamentError("conflict", "Un BYE ne peut pas être mis en forfait");
  }
  if (data.winnerId && !match.players.some((p) => p.playerId === data.winnerId)) {
    throw new TournamentError("invalid", "Le vainqueur doit être un joueur du match");
  }

  const phase = await getPhaseById(tournament.id, match.phaseId);
  if (!phase) {
    throw new TournamentError("not-found", "Phase non trouvée");
  }

  const winnerId = data.winnerId;
  const players: TournamentMatchPlayer[] = match.players.map((p) => ({
    playerId: p.playerId,
    score: winnerId && p.playerId === winnerId ? byeWinScore(phase.bestOf) : 0,
  }));

  const result = await db.collection<TournamentMatchDb>(MATCHES).findOneAndUpdate(
    { _id: new ObjectId(matchId), tournamentId: new ObjectId(tournament.id) },
    {
      $set: {
        players,
        // Aucune partie n'a été jouée : les statistiques de bye sont dérivées du
        // preset au calcul du classement, pas recopiées ici.
        games: [],
        winnerIds: winnerId ? [winnerId] : [],
        resolution: winnerId ? "forfeit" : "double-loss",
        status: "completed",
        reportedBy: actor.id,
        confirmedBy: actor.id,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );
  if (!result) {
    throw new TournamentError("not-found", "Match non trouvé");
  }

  await completeRoundIfAllMatchesDone(new ObjectId(tournament.id), new ObjectId(result.roundId.toString()));

  return toMatch(result);
}

/**
 * Supprime le résultat rapporté d'un match (organisateur) : réinitialise scores,
 * parties et vainqueurs, repasse le match en « pending » et efface reportedBy /
 * confirmedBy. La ronde est rouverte si elle était terminée.
 */
export async function clearMatchResult(
  tournament: Tournament,
  matchId: string,
  actor: MatchActor
): Promise<TournamentMatch> {
  if (!actor.isOrganizer) {
    throw new TournamentError("forbidden", "Seul un organisateur peut supprimer un résultat");
  }

  const match = await getMatchById(tournament.id, matchId);
  if (!match) {
    throw new TournamentError("not-found", "Match non trouvé");
  }
  if (match.players.length === 1) {
    throw new TournamentError("conflict", "Le résultat d'un BYE ne peut pas être supprimé");
  }
  if (match.status === "pending") {
    throw new TournamentError("conflict", "Ce match n'a aucun résultat à supprimer");
  }

  const result = await db.collection<TournamentMatchDb>(MATCHES).findOneAndUpdate(
    { _id: new ObjectId(matchId), tournamentId: new ObjectId(tournament.id) },
    {
      $set: {
        players: match.players.map((p) => ({ playerId: p.playerId, score: 0 })),
        games: [],
        winnerIds: [],
        resolution: "played",
        status: "pending",
        updatedAt: new Date(),
      },
      $unset: { reportedBy: "", confirmedBy: "" },
    },
    { returnDocument: "after" }
  );
  if (!result) {
    throw new TournamentError("not-found", "Match non trouvé");
  }

  // Le match n'est plus terminé : rouvre la ronde si elle l'était.
  await completeRoundIfAllMatchesDone(new ObjectId(tournament.id), new ObjectId(result.roundId.toString()));

  return toMatch(result);
}

export async function deleteMatch(tournamentId: string, matchId: string): Promise<void> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const mId = parseObjectId(matchId, "Match");

  const match = await getMatchById(tournamentId, matchId);
  if (!match) {
    throw new TournamentError("not-found", "Match non trouvé");
  }

  // Un match ne peut être supprimé que s'il appartient à la dernière ronde de
  // sa phase, pour ne pas rendre incohérents les classements et pairings des
  // rondes suivantes.
  const rounds = await listRounds(tournamentId, match.phaseId);
  const lastRound = rounds[rounds.length - 1];
  if (!lastRound || lastRound.id !== match.roundId) {
    throw new TournamentError(
      "conflict",
      "Seuls les matchs de la dernière ronde d'une phase peuvent être supprimés"
    );
  }

  const result = await db.collection<TournamentMatchDb>(MATCHES).deleteOne({ _id: mId, tournamentId: tId });
  if (result.deletedCount === 0) {
    throw new TournamentError("not-found", "Match non trouvé");
  }

  // La suppression peut compléter la ronde (plus aucun match en attente).
  await completeRoundIfAllMatchesDone(tId, new ObjectId(match.roundId));
}

// =====================
// STANDINGS
// =====================

export type TournamentStanding = PlayerStanding & {
  displayName: string;
  discriminator?: string;
  userId?: string;
  playerStatus: TournamentPlayer["status"];
};

/**
 * Preset qui gouverne les colonnes et les départages d'un classement. Pour une
 * phase donnée, c'est le sien. Pour le classement cumulé du tournoi, c'est
 * celui de la dernière phase qui en déclare un : les statistiques se cumulent
 * d'une phase à l'autre, et un tournoi mélangeant des phases avec et sans
 * preset garde ainsi des colonnes lisibles jusqu'au bout.
 */
function resolveStandingsPreset(
  phases: TournamentPhase[],
  phaseId?: string
): GameTournamentPreset | undefined {
  if (phaseId) {
    return getPreset(phases.find((phase) => phase.id === phaseId)?.statsPresetKey);
  }
  const ordered = [...phases].sort((a, b) => a.order - b.order);
  for (let i = ordered.length - 1; i >= 0; i--) {
    const preset = getPreset(ordered[i].statsPresetKey);
    if (preset) return preset;
  }
  return undefined;
}

/**
 * Classement d'une phase (ou du tournoi entier si phaseId est omis), calculé
 * sur les matchs terminés uniquement.
 */
export async function getStandings(tournamentId: string, phaseId?: string): Promise<TournamentStanding[]> {
  const tId = parseObjectId(tournamentId, "Tournoi");

  const filter: Record<string, unknown> = { tournamentId: tId };
  if (phaseId) {
    filter.phaseId = parseObjectId(phaseId, "Phase");
  }

  const [players, matchDocs, phases] = await Promise.all([
    listPlayers(tournamentId),
    db.collection<TournamentMatchDb>(MATCHES).find(filter).toArray(),
    listPhases(tournamentId),
  ]);

  // Chaque match est scoré selon la méthode de sa propre phase (le scoring
  // peut différer d'une phase à l'autre du tournoi).
  const scoringByPhaseId = new Map(phases.map((p) => [p.id, scoringForPhase(p)]));
  const standings = calculateMultiplayerStandings(
    players.map((p) => p.id),
    matchDocs.map(toMatch),
    (match) => scoringByPhaseId.get(match.phaseId) ?? DEFAULT_MATCH_SCORING,
    resolveStandingsPreset(phases, phaseId)
  );

  const playersById = new Map(players.map((p) => [p.id, p]));
  return standings.map((standing) => {
    const player = playersById.get(standing.playerId);
    return {
      ...standing,
      displayName: player?.displayName ?? "Inconnu",
      discriminator: player?.discriminator,
      userId: player?.userId,
      playerStatus: player?.status ?? "registered",
    };
  });
}

// Récapitulatif d'une ronde : ses matchs (parties comprises). Le classement
// figé à l'issue de la ronde est porté par `round.standings`.
export type RoundHistoryEntry = {
  round: TournamentRound;
  matches: TournamentMatch[];
};

// Historique d'une phase : ses rondes ordonnées, chacune avec son récapitulatif.
export type PhaseHistory = {
  phase: TournamentPhase;
  rounds: RoundHistoryEntry[];
};

/**
 * Historique complet du tournoi pour le portail organisateur : les phases
 * ordonnées, et pour chacune ses rondes ordonnées avec le récapitulatif des
 * matchs/parties. Le classement à l'issue de chaque ronde n'est pas recalculé
 * ici : il est lu depuis `round.standings`, figé lors de la validation de la
 * ronde par l'organisateur (voir validateRoundStandings).
 */
export async function getTournamentRoundHistory(
  tournamentId: string
): Promise<{ phases: PhaseHistory[]; players: TournamentPlayer[] }> {
  const tId = parseObjectId(tournamentId, "Tournoi");

  const [players, phases, roundDocs, matchDocs] = await Promise.all([
    listPlayers(tournamentId),
    listPhases(tournamentId),
    db.collection<TournamentRoundDb>(ROUNDS).find({ tournamentId: tId }).sort({ number: 1 }).toArray(),
    db.collection<TournamentMatchDb>(MATCHES).find({ tournamentId: tId }).sort({ createdAt: 1 }).toArray(),
  ]);

  const rounds = roundDocs.map(toRound);
  const matches = matchDocs.map(toMatch);

  // Pré-groupe les matchs par ronde.
  const matchesByRound = new Map<string, TournamentMatch[]>();
  for (const match of matches) {
    const list = matchesByRound.get(match.roundId);
    if (list) list.push(match);
    else matchesByRound.set(match.roundId, [match]);
  }

  // Les phases sont déjà triées par ordre (order, createdAt) par listPhases.
  const phaseHistories: PhaseHistory[] = phases.map((phase) => {
    const phaseRounds = rounds
      .filter((r) => r.phaseId === phase.id)
      .sort((a, b) => a.number - b.number);
    const roundEntries: RoundHistoryEntry[] = phaseRounds.map((round) => ({
      round,
      matches: matchesByRound.get(round.id) ?? [],
    }));
    return { phase, rounds: roundEntries };
  });

  return { phases: phaseHistories, players };
}

/**
 * Calcule et fige en base le classement de la phase à l'issue d'une ronde.
 *
 * Le classement est cumulé sur les matchs terminés de la phase jusqu'à cette
 * ronde incluse (chaque phase reste autonome, ce qui respecte les top cut et
 * les méthodes de scoring propres à chaque phase). Idempotent : rappeler la
 * fonction recalcule et remplace le snapshot (bouton « recalculer »).
 *
 * La ronde doit être terminée : on ne fige pas un classement partiel.
 */
export async function validateRoundStandings(
  tournamentId: string,
  roundId: string
): Promise<TournamentRound> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const rId = parseObjectId(roundId, "Ronde");

  const round = await getRoundById(tournamentId, roundId);
  if (!round) {
    throw new TournamentError("not-found", "Ronde non trouvée");
  }
  if (round.status !== "completed") {
    throw new TournamentError(
      "conflict",
      "La ronde doit être terminée avant de valider son classement"
    );
  }

  const phase = await getPhaseById(tournamentId, round.phaseId);
  if (!phase) {
    throw new TournamentError("not-found", "Phase non trouvée");
  }

  const [players, allPhases, phaseRounds, allMatchDocs] = await Promise.all([
    listPlayers(tournamentId),
    listPhases(tournamentId),
    listRounds(tournamentId, round.phaseId),
    db.collection<TournamentMatchDb>(MATCHES).find({ tournamentId: tId }).toArray(),
  ]);
  const playersById = new Map(players.map((p) => [p.id, p]));
  const scoringByPhaseId = new Map(allPhases.map((p) => [p.id, scoringForPhase(p)]));
  const phaseIndexById = new Map(allPhases.map((p, index) => [p.id, index]));

  // Classement cumulé : matchs de toutes les phases précédentes + les rondes de
  // la phase courante jusqu'à la ronde validée. Chaque match est scoré selon sa
  // propre phase — les points des phases précédentes sont conservés.
  const currentPhaseIndex = phaseIndexById.get(round.phaseId);
  if (currentPhaseIndex === undefined) {
    throw new TournamentError("not-found", "Phase non trouvée");
  }
  const roundIdsUpTo = new Set(
    phaseRounds.filter((r) => r.number <= round.number).map((r) => r.id)
  );
  const allMatches = allMatchDocs.map(toMatch);
  const cumulativeMatches = allMatches.filter((m) => {
    if (m.phaseId === round.phaseId) return roundIdsUpTo.has(m.roundId);
    const index = phaseIndexById.get(m.phaseId);
    return index !== undefined && index < currentPhaseIndex;
  });
  // Ne figer que les joueurs présents dans la phase courante (jusqu'à cette
  // ronde) ; ils portent toutefois leurs points cumulés des phases précédentes.
  const participantIds = [
    ...new Set(
      cumulativeMatches
        .filter((m) => m.phaseId === round.phaseId)
        .flatMap((m) => m.players.map((p) => p.playerId))
    ),
  ];

  const standings: TournamentRoundStanding[] = calculateMultiplayerStandings(
    participantIds,
    cumulativeMatches,
    (m) => scoringByPhaseId.get(m.phaseId) ?? scoringForPhase(phase),
    resolveStandingsPreset(allPhases, round.phaseId)
  ).map((standing) => {
    const player = playersById.get(standing.playerId);
    return {
      ...standing,
      displayName: player?.displayName ?? "Inconnu",
      discriminator: player?.discriminator,
      userId: player?.userId,
      playerStatus: player?.status ?? "registered",
    };
  });

  const result = await db.collection<TournamentRoundDb>(ROUNDS).findOneAndUpdate(
    { _id: rId, tournamentId: tId },
    { $set: { standings, standingsValidatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!result) {
    throw new TournamentError("not-found", "Ronde non trouvée");
  }
  return toRound(result);
}

// =====================
// PHASE TRANSITION
// =====================

export type PhaseEntryQualification = {
  qualified: { playerId: string; displayName: string }[];
  eliminated: { playerId: string; displayName: string }[];
  // Nombre de qualifiés retenu par le top cut (absent si pas de top cut appliqué).
  topCut?: number;
};

// Détermine la phase courante (la plus avancée déjà démarrée) et la prochaine
// phase à démarrer (la première "not-started" qui la suit).
function resolvePhaseTransition(phases: TournamentPhase[]): {
  currentPhase?: TournamentPhase;
  nextPhase?: TournamentPhase;
} {
  let currentIndex = -1;
  for (let i = phases.length - 1; i >= 0; i--) {
    if (phases[i].status !== "not-started") {
      currentIndex = i;
      break;
    }
  }
  const currentPhase = currentIndex >= 0 ? phases[currentIndex] : undefined;
  let nextPhase: TournamentPhase | undefined;
  for (let i = currentIndex + 1; i < phases.length; i++) {
    if (phases[i].status === "not-started") {
      nextPhase = phases[i];
      break;
    }
  }
  return { currentPhase, nextPhase };
}

// Qualifiés / éliminés à l'entrée d'une phase : classement des joueurs inscrits
// (par le classement de la phase précédente, sinon par seed/inscription) puis
// application du top cut de la phase.
async function computePhaseEntryQualification(
  tournamentId: string,
  phase: TournamentPhase,
  phases: TournamentPhase[],
  players: TournamentPlayer[]
): Promise<PhaseEntryQualification> {
  const registered = players.filter((p) => p.status === "registered");
  const nameById = new Map(players.map((p) => [p.id, p.displayName]));

  const phaseIndex = phases.findIndex((p) => p.id === phase.id);
  const previousPhase = phaseIndex > 0 ? phases[phaseIndex - 1] : undefined;

  let rankedIds: string[];
  if (previousPhase) {
    // Classement cumulé de tout le tournoi (toutes phases précédentes) : la
    // qualification top cut tient compte des points de l'ensemble des phases.
    const standings = await getStandings(tournamentId);
    const registeredSet = new Set(registered.map((p) => p.id));
    rankedIds = standings.map((s) => s.playerId).filter((id) => registeredSet.has(id));
    // Inscrits absents du classement (aucun match joué) ajoutés en fin de liste.
    for (const p of registered) if (!rankedIds.includes(p.id)) rankedIds.push(p.id);
  } else {
    // listPlayers trie déjà par seed puis inscription.
    rankedIds = registered.map((p) => p.id);
  }

  const cut = phase.topCut && phase.topCut < rankedIds.length ? phase.topCut : undefined;
  const qualifiedIds = cut ? rankedIds.slice(0, cut) : rankedIds;
  const eliminatedIds = cut ? rankedIds.slice(cut) : [];

  const toEntries = (ids: string[]) =>
    ids.map((id) => ({ playerId: id, displayName: nameById.get(id) ?? "Inconnu" }));

  return { qualified: toEntries(qualifiedIds), eliminated: toEntries(eliminatedIds), topCut: cut };
}

/**
 * Vrai si tous les matchs d'une phase sont terminés (aucun match non
 * "completed"). Sert à interdire de clôturer une phase — et donc de figer le
 * top cut — sur un classement partiel.
 */
async function phaseAllMatchesCompleted(tournamentId: string, phaseId: string): Promise<boolean> {
  const pending = await db.collection<TournamentMatchDb>(MATCHES).findOne({
    tournamentId: new ObjectId(tournamentId),
    phaseId: new ObjectId(phaseId),
    status: { $ne: "completed" },
  });
  return !pending;
}

/**
 * Aperçu du passage à la phase suivante : phase courante (à clôturer), phase à
 * démarrer, et qualification à l'entrée (qualifiés / éliminés par le top cut).
 */
export async function getNextPhaseTransition(tournamentId: string): Promise<{
  currentPhase: { id: string; name: string } | null;
  // Faux si la phase courante a encore des matchs non terminés : la transition
  // est alors refusée (top cut basé sur un classement partiel).
  currentPhaseComplete: boolean;
  nextPhase: { id: string; name: string; type: TournamentPhase["type"]; topCut?: number } | null;
  qualification: PhaseEntryQualification | null;
}> {
  const phases = await listPhases(tournamentId);
  const { currentPhase, nextPhase } = resolvePhaseTransition(phases);
  const currentPhaseComplete = currentPhase
    ? await phaseAllMatchesCompleted(tournamentId, currentPhase.id)
    : true;

  if (!nextPhase) {
    return {
      currentPhase: currentPhase ? { id: currentPhase.id, name: currentPhase.name } : null,
      currentPhaseComplete,
      nextPhase: null,
      qualification: null,
    };
  }

  const players = await listPlayers(tournamentId);
  const qualification = await computePhaseEntryQualification(tournamentId, nextPhase, phases, players);

  return {
    currentPhase: currentPhase ? { id: currentPhase.id, name: currentPhase.name } : null,
    currentPhaseComplete,
    nextPhase: { id: nextPhase.id, name: nextPhase.name, type: nextPhase.type, topCut: nextPhase.topCut },
    qualification,
  };
}

/**
 * Clôture la phase courante et démarre la phase suivante : élimine (DROPPED) les
 * joueurs non qualifiés par le top cut, bascule la phase courante du tournoi et
 * crée la première ronde de la nouvelle phase.
 */
export async function advanceToNextPhase(
  tournamentId: string,
  createdBy: string
): Promise<{ round: TournamentRound; matches: TournamentMatch[]; nextPhaseId: string; eliminatedCount: number }> {
  const phases = await listPhases(tournamentId);
  const { currentPhase, nextPhase } = resolvePhaseTransition(phases);
  if (!nextPhase) {
    throw new TournamentError("conflict", "Aucune phase suivante à démarrer");
  }

  // La phase courante ne peut être clôturée que si tous ses matchs sont
  // terminés (sinon le top cut reposerait sur un classement partiel).
  if (currentPhase && !(await phaseAllMatchesCompleted(tournamentId, currentPhase.id))) {
    throw new TournamentError(
      "conflict",
      "Tous les matchs de la phase courante doivent être terminés avant de passer à la phase suivante"
    );
  }

  const players = await listPlayers(tournamentId);
  const qualification = await computePhaseEntryQualification(tournamentId, nextPhase, phases, players);

  // Vérifie qu'il restera assez de joueurs avant toute mutation (évite un état
  // partiel : phase clôturée / joueurs droppés sans ronde créée).
  if (nextPhase.type !== "freeform" && qualification.qualified.length < nextPhase.minPlayersPerMatch) {
    throw new TournamentError(
      "invalid",
      `Au moins ${nextPhase.minPlayersPerMatch} joueurs qualifiés sont requis pour démarrer cette phase`
    );
  }

  // Regroupe les mutations de transition dans une transaction : clôture de la
  // phase courante, mémorisation des joueurs éliminés par le top cut
  // (entryDroppedPlayerIds — seule source pour les restaurer ensuite), drop de
  // ces joueurs et bascule de currentPhaseId restent ainsi atomiques (pas de
  // drop sans enregistrement, ni inversement).
  const eliminatedIds = qualification.eliminated.map((p) => p.playerId);
  const tObjId = new ObjectId(tournamentId);
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      if (currentPhase && currentPhase.status !== "completed") {
        await db
          .collection<TournamentPhaseDb>(PHASES)
          .updateOne(
            { _id: new ObjectId(currentPhase.id), tournamentId: tObjId },
            { $set: { status: "completed" } },
            { session }
          );
      }
      await db
        .collection<TournamentPhaseDb>(PHASES)
        .updateOne(
          { _id: new ObjectId(nextPhase.id), tournamentId: tObjId },
          { $set: { entryDroppedPlayerIds: eliminatedIds } },
          { session }
        );
      if (eliminatedIds.length > 0) {
        await db.collection<TournamentPlayerDb>(PLAYERS).updateMany(
          { _id: { $in: eliminatedIds.map((id) => new ObjectId(id)) }, tournamentId: tObjId },
          { $set: { status: "dropped" } },
          { session }
        );
      }
      await db
        .collection<TournamentDb>(TOURNAMENTS)
        .updateOne({ _id: tObjId }, { $set: { currentPhaseId: nextPhase.id } }, { session });
    });
  } finally {
    await session.endSession();
  }

  // Crée la première ronde de la nouvelle phase.
  const { round, matches } = await createNextRound(tournamentId, nextPhase.id, createdBy);

  return { round, matches, nextPhaseId: nextPhase.id, eliminatedCount: qualification.eliminated.length };
}
