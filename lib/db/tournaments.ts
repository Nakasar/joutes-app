import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId, WithId } from "mongodb";
import {
  Tournament,
  TournamentDb,
  TournamentMatch,
  TournamentMatchDb,
  TournamentMatchFormat,
  TournamentPhase,
  TournamentPhaseDb,
  TournamentPlayer,
  TournamentPlayerDb,
  TournamentRound,
  TournamentRoundDb,
} from "@/lib/types/Tournament";
import {
  PairingMatch,
  PairingResult,
  PlayerStanding,
  calculateStandings,
  generateBracketPosition,
  generateEliminationBracket,
  generateNextBracketRound,
  generateSwissPairings,
} from "@/lib/utils/pairing";

const TOURNAMENTS = "tournaments";
const PLAYERS = "tournament-players";
const PHASES = "tournament-phases";
const ROUNDS = "tournament-rounds";
const MATCHES = "tournament-matches";

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
    settings: doc.settings,
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
    status: doc.status,
    addedBy: doc.addedBy,
    createdAt: doc.createdAt,
  };
}

function toPhase(doc: WithId<TournamentPhaseDb>): TournamentPhase {
  return {
    id: doc._id.toString(),
    tournamentId: doc.tournamentId.toString(),
    name: doc.name,
    type: doc.type,
    matchFormat: doc.matchFormat,
    plannedRounds: doc.plannedRounds,
    topCut: doc.topCut,
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
    player1Id: doc.player1Id,
    player2Id: doc.player2Id,
    player1Score: doc.player1Score,
    player2Score: doc.player2Score,
    winnerId: doc.winnerId,
    bracketPosition: doc.bracketPosition,
    status: doc.status,
    reportedBy: doc.reportedBy,
    confirmedBy: doc.confirmedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toPairingMatch(match: TournamentMatch): PairingMatch {
  return {
    matchId: match.id,
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    player1Score: match.player1Score,
    player2Score: match.player2Score,
    winnerId: match.winnerId,
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

// Score awarded to the lone player of a BYE match, per match format.
function byeWinScore(format: TournamentMatchFormat): number {
  switch (format) {
    case "BO1":
      return 1;
    case "BO2":
      return 2;
    case "BO3":
      return 2;
    case "BO5":
      return 3;
  }
}

// =====================
// TOURNAMENT
// =====================

export async function createTournament(data: {
  name: string;
  eventId?: string;
  gameId?: string;
  settings: { allowSelfReporting: boolean; requireConfirmation: boolean };
  createdBy: string;
}): Promise<Tournament> {
  const doc: TournamentDb = {
    name: data.name,
    eventId: data.eventId,
    gameId: data.gameId,
    status: "draft",
    settings: data.settings,
    createdBy: data.createdBy,
    organizerIds: [data.createdBy],
    createdAt: new Date(),
  };

  const result = await db.collection<TournamentDb>(TOURNAMENTS).insertOne(doc);
  return toTournament({ ...doc, _id: result.insertedId });
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
  ]);
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
  data: { displayName: string; userId?: string; seed?: number; addedBy: string }
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
    status: "active",
    addedBy: data.addedBy,
    createdAt: new Date(),
  };

  const result = await db.collection<TournamentPlayerDb>(PLAYERS).insertOne(doc);
  return toPlayer({ ...doc, _id: result.insertedId });
}

export async function updatePlayer(
  tournamentId: string,
  playerId: string,
  updates: { displayName?: string; seed?: number | null; status?: "active" | "dropped" }
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
    $or: [{ player1Id: playerId }, { player2Id: playerId }],
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

export async function addPhase(
  tournamentId: string,
  data: {
    name: string;
    type: TournamentPhase["type"];
    matchFormat: TournamentMatchFormat;
    plannedRounds?: number;
    topCut?: number;
    order?: number;
  }
): Promise<TournamentPhase> {
  const _id = parseObjectId(tournamentId, "Tournoi");

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
    matchFormat: data.matchFormat,
    plannedRounds: data.plannedRounds,
    topCut: data.topCut,
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
    matchFormat?: TournamentMatchFormat;
    plannedRounds?: number | null;
    topCut?: number | null;
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

  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  if (updates.name !== undefined) set.name = updates.name;
  if (updates.type !== undefined) set.type = updates.type;
  if (updates.matchFormat !== undefined) set.matchFormat = updates.matchFormat;
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
  const activePlayerIds = players.filter((p) => p.status === "active").map((p) => p.id);

  let pairings: PairingResult[] = [];

  if (phase.type === "swiss") {
    if (activePlayerIds.length < 2) {
      throw new TournamentError("invalid", "Au moins 2 joueurs actifs sont requis");
    }
    pairings = generateSwissPairings(activePlayerIds, phaseMatches.map(toPairingMatch), roundNumber);
  } else if (phase.type === "bracket") {
    if (lastRound) {
      const lastRoundMatches = phaseMatches.filter((m) => m.roundId === lastRound.id);
      if (lastRoundMatches.length === 1) {
        throw new TournamentError("conflict", "La finale a déjà été jouée, le bracket est complet");
      }
      pairings = generateNextBracketRound(lastRoundMatches.map(toPairingMatch));
    } else {
      // Première ronde du bracket : seeding depuis le classement de la phase précédente
      // s'il y en a une, sinon depuis l'ordre des seeds/inscriptions.
      if (activePlayerIds.length < 2) {
        throw new TournamentError("invalid", "Au moins 2 joueurs actifs sont requis");
      }
      const phases = await listPhases(tournamentId);
      const phaseIndex = phases.findIndex((p) => p.id === phaseId);
      const previousPhase = phaseIndex > 0 ? phases[phaseIndex - 1] : undefined;
      const seedingMatches = previousPhase
        ? (await listPhaseMatches(tId, new ObjectId(previousPhase.id))).map(toPairingMatch)
        : [];
      pairings = generateEliminationBracket(activePlayerIds, seedingMatches, phase.topCut);
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
  const roundResult = await db.collection<TournamentRoundDb>(ROUNDS).insertOne(roundDoc);
  const round = toRound({ ...roundDoc, _id: roundResult.insertedId });

  const matchDocs: TournamentMatchDb[] = pairings.map((pairing, i) => {
    const isBye = pairing.player2Id === null;
    return {
      tournamentId: tId,
      phaseId: pId,
      roundId: roundResult.insertedId,
      player1Id: pairing.player1Id,
      player2Id: pairing.player2Id,
      player1Score: isBye ? byeWinScore(phase.matchFormat) : 0,
      player2Score: 0,
      winnerId: isBye ? pairing.player1Id : undefined,
      bracketPosition: phase.type === "bracket" ? generateBracketPosition(i, pairings.length) : undefined,
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
 * Ajout manuel d'un match dans une ronde (phases freeform, ou correction
 * exceptionnelle par un organisateur).
 */
export async function createMatch(
  tournamentId: string,
  roundId: string,
  data: { player1Id: string; player2Id: string | null; bracketPosition?: string }
): Promise<TournamentMatch> {
  const round = await getRoundById(tournamentId, roundId);
  if (!round) {
    throw new TournamentError("not-found", "Ronde non trouvée");
  }

  const player1 = await getPlayerById(tournamentId, data.player1Id);
  if (!player1) {
    throw new TournamentError("invalid", "Joueur 1 non trouvé dans ce tournoi");
  }
  if (data.player2Id !== null) {
    const player2 = await getPlayerById(tournamentId, data.player2Id);
    if (!player2) {
      throw new TournamentError("invalid", "Joueur 2 non trouvé dans ce tournoi");
    }
  }

  const doc: TournamentMatchDb = {
    tournamentId: new ObjectId(tournamentId),
    phaseId: new ObjectId(round.phaseId),
    roundId: new ObjectId(roundId),
    player1Id: data.player1Id,
    player2Id: data.player2Id,
    player1Score: 0,
    player2Score: 0,
    bracketPosition: data.bracketPosition,
    status: "pending",
    createdAt: new Date(),
  };

  const result = await db.collection<TournamentMatchDb>(MATCHES).insertOne(doc);
  return toMatch({ ...doc, _id: result.insertedId });
}

export async function reportMatchResult(
  tournament: Tournament,
  matchId: string,
  data: { player1Score: number; player2Score: number },
  reporterUserId: string
): Promise<TournamentMatch> {
  const match = await getMatchById(tournament.id, matchId);
  if (!match) {
    throw new TournamentError("not-found", "Match non trouvé");
  }
  if (match.player2Id === null) {
    throw new TournamentError("conflict", "Le résultat d'un BYE ne peut pas être modifié");
  }

  const organizer = isTournamentOrganizer(tournament, reporterUserId);

  // Un joueur ne peut rapporter que son propre match, et seulement si le
  // self-reporting est activé sur le tournoi.
  if (!organizer) {
    if (!tournament.settings.allowSelfReporting) {
      throw new TournamentError("forbidden", "Le rapport de résultat par les joueurs est désactivé");
    }
    const players = await listPlayers(tournament.id);
    const reporterPlayerIds = players
      .filter((p) => p.userId === reporterUserId)
      .map((p) => p.id);
    const isInMatch =
      reporterPlayerIds.includes(match.player1Id) ||
      (match.player2Id !== null && reporterPlayerIds.includes(match.player2Id));
    if (!isInMatch) {
      throw new TournamentError("forbidden", "Vous ne faites pas partie de ce match");
    }
  }

  const winnerId =
    data.player1Score > data.player2Score
      ? match.player1Id
      : data.player2Score > data.player1Score
        ? match.player2Id
        : null;

  // Sans confirmation requise (ou pour un organisateur), le résultat est final.
  const needsConfirmation = tournament.settings.requireConfirmation && !organizer;

  const set: Record<string, unknown> = {
    player1Score: data.player1Score,
    player2Score: data.player2Score,
    winnerId,
    reportedBy: reporterUserId,
    status: needsConfirmation ? "in-progress" : "completed",
    updatedAt: new Date(),
  };
  if (!needsConfirmation) {
    set.confirmedBy = reporterUserId;
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
  confirmerUserId: string
): Promise<TournamentMatch> {
  const match = await getMatchById(tournament.id, matchId);
  if (!match) {
    throw new TournamentError("not-found", "Match non trouvé");
  }
  if (match.status !== "in-progress") {
    throw new TournamentError("conflict", "Ce match n'attend pas de confirmation");
  }

  const organizer = isTournamentOrganizer(tournament, confirmerUserId);

  if (!organizer) {
    if (match.reportedBy === confirmerUserId) {
      throw new TournamentError("forbidden", "Vous ne pouvez pas confirmer votre propre rapport");
    }
    const players = await listPlayers(tournament.id);
    const confirmerPlayerIds = players
      .filter((p) => p.userId === confirmerUserId)
      .map((p) => p.id);
    const isInMatch =
      confirmerPlayerIds.includes(match.player1Id) ||
      (match.player2Id !== null && confirmerPlayerIds.includes(match.player2Id));
    if (!isInMatch) {
      throw new TournamentError("forbidden", "Vous ne faites pas partie de ce match");
    }
  }

  const result = await db.collection<TournamentMatchDb>(MATCHES).findOneAndUpdate(
    { _id: new ObjectId(matchId), tournamentId: new ObjectId(tournament.id) },
    { $set: { confirmedBy: confirmerUserId, status: "completed", updatedAt: new Date() } },
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
  disputerUserId: string
): Promise<TournamentMatch> {
  const match = await getMatchById(tournament.id, matchId);
  if (!match) {
    throw new TournamentError("not-found", "Match non trouvé");
  }

  const organizer = isTournamentOrganizer(tournament, disputerUserId);
  if (!organizer) {
    const players = await listPlayers(tournament.id);
    const disputerPlayerIds = players
      .filter((p) => p.userId === disputerUserId)
      .map((p) => p.id);
    const isInMatch =
      disputerPlayerIds.includes(match.player1Id) ||
      (match.player2Id !== null && disputerPlayerIds.includes(match.player2Id));
    if (!isInMatch) {
      throw new TournamentError("forbidden", "Vous ne faites pas partie de ce match");
    }
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
  const result = await db.collection<TournamentMatchDb>(MATCHES).deleteOne({ _id: mId, tournamentId: tId });
  if (result.deletedCount === 0) {
    throw new TournamentError("not-found", "Match non trouvé");
  }
}

// =====================
// STANDINGS
// =====================

export type TournamentStanding = PlayerStanding & {
  displayName: string;
  userId?: string;
  playerStatus: TournamentPlayer["status"];
};

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

  const [players, matchDocs] = await Promise.all([
    listPlayers(tournamentId),
    db.collection<TournamentMatchDb>(MATCHES).find(filter).toArray(),
  ]);

  const matches = matchDocs.map(toMatch).map(toPairingMatch);
  const standings = calculateStandings(players.map((p) => p.id), matches);

  const playersById = new Map(players.map((p) => [p.id, p]));
  return standings.map((standing) => {
    const player = playersById.get(standing.playerId);
    return {
      ...standing,
      displayName: player?.displayName ?? "Inconnu",
      userId: player?.userId,
      playerStatus: player?.status ?? "active",
    };
  });
}
