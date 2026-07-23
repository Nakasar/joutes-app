import 'server-only';

import crypto from "crypto";
import { customAlphabet } from "nanoid";
import db from "@/lib/mongodb";
import { ObjectId, WithId } from "mongodb";
import {
  DEFAULT_FIXED_SCORING,
  DEFAULT_RANK_OFFSETS,
  Tournament,
  TournamentAnnouncement,
  TournamentAnnouncementDb,
  TournamentAnnouncementLevel,
  TournamentDb,
  TournamentEliminationSeeding,
  TournamentFixedScoring,
  TournamentGameResult,
  TournamentMatch,
  TournamentMatchDb,
  TournamentMatchPlayer,
  TournamentPhase,
  TournamentPhaseDb,
  TournamentPlayer,
  TournamentPlayerDb,
  TournamentResultMode,
  TournamentRound,
  TournamentRoundDb,
  TournamentRoundStanding,
  TournamentScoringMethod,
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
import {
  createInvitedUserByEmail,
  getUserByEmail,
  getUserByUsernameAndDiscriminator,
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

// Code de participation : 9 caractères alphanumériques majuscules (nanoid).
const joinCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const generateJoinCodeValue = customAlphabet(joinCodeAlphabet, 9);

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
    timer: doc.timer,
    settings: {
      allowSelfReporting: doc.settings.allowSelfReporting,
      requireConfirmation: doc.settings.requireConfirmation,
      // Défaut pour les tournois créés avant l'ajout du mode pré-inscription.
      preRegistration: doc.settings.preRegistration ?? false,
    },
    createdBy: doc.createdBy,
    organizerIds: doc.organizerIds,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toPlayer(doc: WithId<TournamentPlayerDb>): TournamentPlayer {
  return {
    id: doc._id.toString(),
    tournamentId: doc.tournamentId.toString(),
    userId: doc.userId,
    displayName: doc.displayName,
    seed: doc.seed,
    // Statuts connus conservés ; l'ancienne valeur "active" (avant renommage)
    // et toute valeur inattendue sont normalisées en "registered".
    status:
      doc.status === "dropped" || doc.status === "pre-registered" ? doc.status : "registered",
    syncKey: doc.syncKey,
    addedBy: doc.addedBy,
    createdAt: doc.createdAt,
  };
}

// Retire le secret de synchronisation d'un joueur avant exposition à un
// non-organisateur.
export function sanitizePlayer(player: TournamentPlayer): Omit<TournamentPlayer, "syncKey"> {
  const { syncKey: _syncKey, ...rest } = player;
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
    plannedRounds: doc.plannedRounds,
    topCut: doc.topCut,
    minPlayersPerMatch: doc.minPlayersPerMatch ?? 2,
    maxPlayersPerMatch: doc.maxPlayersPerMatch ?? 2,
    order: doc.order,
    status: doc.status,
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
    bracketPosition: doc.bracketPosition,
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
  resultMode: TournamentResultMode
): { normalizedGames: TournamentGameResult[]; gamesWonByPlayer: Map<string, number> } {
  const gamesWonByPlayer = new Map<string, number>(matchPlayerIds.map((id) => [id, 0]));
  const normalizedGames: TournamentGameResult[] = games.map((game) => {
    let winnerId: string | null | undefined = game.winnerId ?? null;

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
      return { winnerId, points: normalizedPoints };
    }

    if (winnerId) {
      gamesWonByPlayer.set(winnerId, (gamesWonByPlayer.get(winnerId) ?? 0) + 1);
    }
    return { winnerId: winnerId ?? null };
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

export async function createTournament(data: {
  name: string;
  eventId?: string;
  gameId?: string;
  settings: { allowSelfReporting: boolean; requireConfirmation: boolean; preRegistration: boolean };
  createdBy: string;
}): Promise<Tournament> {
  await joinCodeIndexReady;
  // Ré-essaie sur une collision de code (E11000) contre l'index unique partiel :
  // en pratique quasi impossible, mais garantit l'unicité même en concurrence.
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc: TournamentDb = {
      name: data.name,
      eventId: data.eventId,
      gameId: data.gameId,
      status: "draft",
      joinCode: await generateUniqueJoinCode(),
      settings: data.settings,
      createdBy: data.createdBy,
      organizerIds: [data.createdBy],
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

export function isTournamentOrganizer(tournament: Tournament, userId: string): boolean {
  return tournament.createdBy === userId || tournament.organizerIds.includes(userId);
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

// Read access: organizers and registered players.
export async function assertCanReadTournament(tournament: Tournament, userId: string): Promise<void> {
  if (isTournamentOrganizer(tournament, userId)) return;
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

export function principalIsOrganizer(tournament: Tournament, principal: TournamentPrincipal): boolean {
  return principal.kind === "user" && isTournamentOrganizer(tournament, principal.userId);
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
};

export async function buildMatchActor(
  tournament: Tournament,
  principal: TournamentPrincipal
): Promise<MatchActor> {
  if (principal.kind === "player") {
    const identityIds = [principal.player.id];
    if (principal.player.userId) identityIds.push(principal.player.userId);
    return { id: principal.player.id, playerIds: [principal.player.id], identityIds, isOrganizer: false };
  }
  const players = await listPlayers(tournament.id);
  const playerIds = players.filter((p) => p.userId === principal.userId).map((p) => p.id);
  return {
    id: principal.userId,
    playerIds,
    identityIds: [principal.userId, ...playerIds],
    isOrganizer: isTournamentOrganizer(tournament, principal.userId),
  };
}

export function assertIsOrganizer(tournament: Tournament, userId: string): void {
  if (!isTournamentOrganizer(tournament, userId)) {
    throw new TournamentError("forbidden", "Réservé aux organisateurs du tournoi");
  }
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
    settings?: Partial<Tournament["settings"]>;
    organizerIds?: string[];
  }
): Promise<Tournament> {
  const _id = parseObjectId(tournamentId, "Tournoi");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  const unset: Record<string, ""> = {};

  if (updates.name !== undefined) set.name = updates.name;
  if (updates.status !== undefined) set.status = updates.status;
  if (updates.currentPhaseId === null) {
    unset.currentPhaseId = "";
  } else if (updates.currentPhaseId !== undefined) {
    set.currentPhaseId = updates.currentPhaseId;
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

// Démarre le minuteur : fixe l'instant de fin absolu (now + durée).
export async function startTimer(tournamentId: string, durationSeconds: number): Promise<Tournament> {
  return updateTournamentTimer(tournamentId, {
    durationSeconds,
    endsAt: new Date(Date.now() + durationSeconds * 1000),
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

  const doc: TournamentPlayerDb = {
    tournamentId: _id,
    userId: data.userId,
    displayName: data.displayName,
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
  updates: { displayName?: string; seed?: number | null; status?: TournamentPlayer["status"] }
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
  if (updates.status !== undefined) set.status = updates.status;

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
  const docs = await db
    .collection<TournamentMatchDb>(MATCHES)
    .find({ tournamentId, phaseId })
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map(toMatch);
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

  // Chaque groupe = les joueurs d'un match à créer ; un groupe de taille 1
  // est un BYE. Uniformise pairings 2-joueurs (bracket, suisse en duel) et
  // pods multijoueurs (suisse/élimination).
  const pairingsToGroups = (pairings: PairingResult[]): string[][] =>
    pairings.map((p) => (p.player2Id === null ? [p.player1Id] : [p.player1Id, p.player2Id]));

  // Ordonne un ensemble de joueurs pour l'appariement : soit aléatoirement,
  // soit selon le classement (multijoueur, scoring de la phase) sur les matchs
  // déjà joués de la phase.
  const orderPlayers = (ids: string[], seeding: TournamentEliminationSeeding): string[] =>
    seeding === "random"
      ? shuffleArray([...ids])
      : calculateMultiplayerStandings(ids, phaseMatches, () => scoringForPhase(phase)).map((s) => s.playerId);

  // Ensemble qualifié à l'entrée de la phase : classé par le classement de la
  // phase précédente (si présente), sinon par seed/inscription, puis limité au
  // top cut éventuel.
  const qualifiedEntryPlayers = async (): Promise<string[]> => {
    const allPhases = await listPhases(tournamentId);
    const phaseIndex = allPhases.findIndex((p) => p.id === phaseId);
    const previousPhase = phaseIndex > 0 ? allPhases[phaseIndex - 1] : undefined;
    let ranked = activePlayerIds; // déjà trié par seed puis inscription
    if (previousPhase) {
      const previousPhaseMatches = await listPhaseMatches(tId, new ObjectId(previousPhase.id));
      ranked = calculateMultiplayerStandings(
        activePlayerIds,
        previousPhaseMatches,
        () => scoringForPhase(previousPhase)
      ).map((s) => s.playerId);
    }
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
      : await qualifiedEntryPlayers();
    if (field.length < minPlayers) {
      throw new TournamentError("invalid", `Au moins ${minPlayers} joueurs actifs sont requis`);
    }
    if (minPlayers === 2 && maxPlayers === 2) {
      // Duel : appariement suisse classique (avec évitement des re-matchs).
      groups = pairingsToGroups(generateSwissPairings(field, phaseMatches.map(toPairingMatch), roundNumber));
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
      field = await qualifiedEntryPlayers();
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
      // Première ronde : seedée sur l'ordre qualifié d'entrée (top cut inclus).
      const seededField = await qualifiedEntryPlayers();
      if (seededField.length < 2) {
        throw new TournamentError("invalid", "Au moins 2 joueurs actifs sont requis");
      }
      groups = pairingsToGroups(generateEliminationBracket(seededField, [], undefined));
    }
  }
  // freeform: pas de génération, la ronde est créée vide.

  const now = new Date();
  const roundDoc: TournamentRoundDb = {
    tournamentId: tId,
    phaseId: pId,
    number: roundNumber,
    status: "in-progress",
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

// =====================
// MATCHES
// =====================

export async function listMatchesByRound(tournamentId: string, roundId: string): Promise<TournamentMatch[]> {
  const tId = parseObjectId(tournamentId, "Tournoi");
  const rId = parseObjectId(roundId, "Ronde");
  const docs = await db
    .collection<TournamentMatchDb>(MATCHES)
    .find({ tournamentId: tId, roundId: rId })
    .sort({ createdAt: 1 })
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

  // Au plus bestOf parties ; chaque partie ne concerne que des joueurs du match.
  if (data.games.length > phase.bestOf) {
    throw new TournamentError("invalid", `Un best-of-${phase.bestOf} compte au plus ${phase.bestOf} parties`);
  }
  for (const game of data.games) {
    if (game.winnerId != null && !matchPlayerIds.includes(game.winnerId)) {
      throw new TournamentError("invalid", "Le vainqueur d'une partie doit être un joueur du match");
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
  const { normalizedGames, gamesWonByPlayer } = tallyGames(data.games, matchPlayerIds, phase.resultMode);

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
  userId?: string;
  playerStatus: TournamentPlayer["status"];
};

type MatchScoring = {
  method: TournamentScoringMethod;
  fixed: TournamentFixedScoring;
  rankOffsets: number[];
};

function scoringForPhase(phase: TournamentPhase): MatchScoring {
  return { method: phase.scoringMethod, fixed: phase.fixedScoring, rankOffsets: phase.rankOffsets };
}

const DEFAULT_MATCH_SCORING: MatchScoring = {
  method: "fixed",
  fixed: DEFAULT_FIXED_SCORING,
  rankOffsets: DEFAULT_RANK_OFFSETS,
};

// Points « rank_offset » d'un joueur : N + offset[rang], N = nombre de joueurs
// du match, rang déterminé par les parties gagnées (score). Les ex æquo
// partagent le même rang ; au-delà du tableau, on réutilise le dernier offset.
function rankOffsetPoints(match: TournamentMatch, playerId: string, offsets: number[]): number {
  const n = match.players.length;
  const self = match.players.find((p) => p.playerId === playerId);
  if (!self) return 0;
  const rankIndex = match.players.filter((p) => p.score > self.score).length;
  const offset = offsets[Math.min(rankIndex, offsets.length - 1)] ?? 0;
  return n + offset;
}

/**
 * Classement multijoueur, sensible au scoring de chaque match (résolu via
 * `scoringFor`). Généralise le calcul 2-joueurs de lib/utils/pairing.ts.
 * - wins/losses/draws et OMW% dérivent des vainqueurs (winnerIds) ;
 * - matchPoints selon la méthode de la phase (fixed ou rank_offset) ;
 * - BYE (1 seul joueur) = victoire automatique.
 */
function calculateMultiplayerStandings(
  playerIds: string[],
  matches: TournamentMatch[],
  scoringFor: (match: TournamentMatch) => MatchScoring = () => DEFAULT_MATCH_SCORING
): PlayerStanding[] {
  const standings = new Map<string, PlayerStanding>();

  playerIds.forEach((playerId) => {
    standings.set(playerId, {
      playerId,
      wins: 0,
      losses: 0,
      draws: 0,
      matchPoints: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDiff: 0,
    });
  });

  const completedMatches = matches.filter((m) => m.status === "completed");

  for (const match of completedMatches) {
    const isBye = match.players.length === 1;
    const totalScore = match.players.reduce((sum, p) => sum + p.score, 0);
    const isDraw = !isBye && match.winnerIds.length === 0;
    const scoring = scoringFor(match);

    for (const matchPlayer of match.players) {
      const standing = standings.get(matchPlayer.playerId);
      if (!standing) continue;

      standing.gamesWon += matchPlayer.score;
      standing.gamesLost += totalScore - matchPlayer.score;

      const isWinner = isBye || match.winnerIds.includes(matchPlayer.playerId);
      if (isWinner) {
        standing.wins++;
      } else if (isDraw) {
        standing.draws++;
      } else {
        standing.losses++;
      }

      if (scoring.method === "rank_offset") {
        standing.matchPoints += rankOffsetPoints(match, matchPlayer.playerId, scoring.rankOffsets);
      } else if (isWinner) {
        standing.matchPoints += scoring.fixed.win;
      } else if (isDraw) {
        standing.matchPoints += scoring.fixed.draw;
      } else {
        standing.matchPoints += scoring.fixed.loss;
      }
    }
  }

  standings.forEach((standing) => {
    standing.gamesDiff = standing.gamesWon - standing.gamesLost;
  });

  // Opponent match win percentage (tiebreaker) : moyenne du taux de victoire
  // de tous les adversaires rencontrés (co-joueurs des matchs terminés).
  standings.forEach((standing) => {
    const opponentIds = completedMatches
      .filter((m) => m.players.some((p) => p.playerId === standing.playerId))
      .flatMap((m) => m.players.map((p) => p.playerId))
      .filter((id) => id !== standing.playerId);

    if (opponentIds.length > 0) {
      const totalOpponentWinPercentage = opponentIds.reduce((sum, oppId) => {
        const opp = standings.get(oppId);
        if (!opp) return sum;
        const totalMatches = opp.wins + opp.losses + opp.draws;
        return sum + (totalMatches > 0 ? opp.wins / totalMatches : 0);
      }, 0);
      standing.opponentMatchWinPercentage = totalOpponentWinPercentage / opponentIds.length;
    }
  });

  return Array.from(standings.values()).sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if ((b.opponentMatchWinPercentage || 0) !== (a.opponentMatchWinPercentage || 0)) {
      return (b.opponentMatchWinPercentage || 0) - (a.opponentMatchWinPercentage || 0);
    }
    if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
    return b.gamesWon - a.gamesWon;
  });
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
    (match) => scoringByPhaseId.get(match.phaseId) ?? DEFAULT_MATCH_SCORING
  );

  const playersById = new Map(players.map((p) => [p.id, p]));
  return standings.map((standing) => {
    const player = playersById.get(standing.playerId);
    return {
      ...standing,
      displayName: player?.displayName ?? "Inconnu",
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

  const [players, phaseRounds, phaseMatches] = await Promise.all([
    listPlayers(tournamentId),
    listRounds(tournamentId, round.phaseId),
    listPhaseMatches(tId, new ObjectId(round.phaseId)),
  ]);
  const playersById = new Map(players.map((p) => [p.id, p]));

  // Matchs de la phase des rondes jusqu'à celle validée (classement cumulé).
  const roundIdsUpTo = new Set(
    phaseRounds.filter((r) => r.number <= round.number).map((r) => r.id)
  );
  const cumulativeMatches = phaseMatches.filter((m) => roundIdsUpTo.has(m.roundId));
  const participantIds = [
    ...new Set(cumulativeMatches.flatMap((m) => m.players.map((p) => p.playerId))),
  ];

  const standings: TournamentRoundStanding[] = calculateMultiplayerStandings(
    participantIds,
    cumulativeMatches,
    () => scoringForPhase(phase)
  ).map((standing) => {
    const player = playersById.get(standing.playerId);
    return {
      ...standing,
      displayName: player?.displayName ?? "Inconnu",
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
    const standings = await getStandings(tournamentId, previousPhase.id);
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

  // Clôture la phase courante.
  if (currentPhase && currentPhase.status !== "completed") {
    await updatePhase(tournamentId, currentPhase.id, { status: "completed" });
  }
  // Élimine les joueurs non qualifiés (un seul updateMany plutôt qu'une boucle).
  if (qualification.eliminated.length > 0) {
    await db.collection<TournamentPlayerDb>(PLAYERS).updateMany(
      {
        _id: { $in: qualification.eliminated.map((p) => new ObjectId(p.playerId)) },
        tournamentId: new ObjectId(tournamentId),
      },
      { $set: { status: "dropped" } }
    );
  }
  // Bascule la phase courante et crée la première ronde.
  await updateTournament(tournamentId, { currentPhaseId: nextPhase.id });
  const { round, matches } = await createNextRound(tournamentId, nextPhase.id, createdBy);

  return { round, matches, nextPhaseId: nextPhase.id, eliminatedCount: qualification.eliminated.length };
}
