import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId, WithId } from "mongodb";
import {
  Tournament,
  TournamentDb,
  TournamentMatch,
  TournamentMatchDb,
  TournamentMatchFormat,
  TournamentMatchPlayer,
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
    players: doc.players,
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
      // Première ronde du bracket : seeding depuis le classement de la phase
      // précédente s'il y en a une, sinon depuis l'ordre des seeds/inscriptions.
      // Le classement est calculé avec la variante multijoueur pour supporter
      // une phase précédente freeform contenant des matchs à 3+ joueurs.
      if (activePlayerIds.length < 2) {
        throw new TournamentError("invalid", "Au moins 2 joueurs actifs sont requis");
      }
      const phases = await listPhases(tournamentId);
      const phaseIndex = phases.findIndex((p) => p.id === phaseId);
      const previousPhase = phaseIndex > 0 ? phases[phaseIndex - 1] : undefined;
      let rankedPlayerIds = activePlayerIds;
      if (previousPhase) {
        const previousPhaseMatches = await listPhaseMatches(tId, new ObjectId(previousPhase.id));
        rankedPlayerIds = calculateMultiplayerStandings(activePlayerIds, previousPhaseMatches).map(
          (s) => s.playerId
        );
      }
      // Les joueurs étant déjà classés, le bracket est seedé sur cet ordre.
      pairings = generateEliminationBracket(rankedPlayerIds, [], phase.topCut);
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
    const matchPlayers: TournamentMatchPlayer[] = isBye
      ? [{ playerId: pairing.player1Id, score: byeWinScore(phase.matchFormat) }]
      : [
          { playerId: pairing.player1Id, score: 0 },
          { playerId: pairing.player2Id!, score: 0 },
        ];
    return {
      tournamentId: tId,
      phaseId: pId,
      roundId: roundResult.insertedId,
      players: matchPlayers,
      winnerIds: isBye ? [pairing.player1Id] : [],
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

  // Les pairings et classements des phases swiss/bracket sont strictement
  // 2 joueurs : les matchs multijoueurs n'y sont pas autorisés.
  if (data.players.length > 2 && phase.type !== "freeform") {
    throw new TournamentError(
      "invalid",
      "Les matchs à plus de 2 joueurs ne sont autorisés que dans les phases freeform"
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
      score: isBye ? byeWinScore(phase.matchFormat) : 0,
    })),
    winnerIds: isBye ? [data.players[0]] : [],
    bracketPosition: data.bracketPosition,
    status: isBye ? "completed" : "pending",
    createdAt: new Date(),
  };

  const result = await db.collection<TournamentMatchDb>(MATCHES).insertOne(doc);
  return toMatch({ ...doc, _id: result.insertedId });
}

// Vérifie que l'utilisateur (via ses inscriptions joueur au tournoi) fait
// partie du match.
async function assertUserIsInMatch(
  tournamentId: string,
  match: TournamentMatch,
  userId: string
): Promise<void> {
  const players = await listPlayers(tournamentId);
  const userPlayerIds = new Set(players.filter((p) => p.userId === userId).map((p) => p.id));
  const isInMatch = match.players.some((p) => userPlayerIds.has(p.playerId));
  if (!isInMatch) {
    throw new TournamentError("forbidden", "Vous ne faites pas partie de ce match");
  }
}

export async function reportMatchResult(
  tournament: Tournament,
  matchId: string,
  data: { scores: Record<string, number>; winnerIds?: string[] },
  reporterUserId: string
): Promise<TournamentMatch> {
  const match = await getMatchById(tournament.id, matchId);
  if (!match) {
    throw new TournamentError("not-found", "Match non trouvé");
  }
  if (match.players.length === 1) {
    throw new TournamentError("conflict", "Le résultat d'un BYE ne peut pas être modifié");
  }

  const organizer = isTournamentOrganizer(tournament, reporterUserId);

  // Un joueur ne peut rapporter que son propre match, et seulement si le
  // self-reporting est activé sur le tournoi.
  if (!organizer) {
    if (!tournament.settings.allowSelfReporting) {
      throw new TournamentError("forbidden", "Le rapport de résultat par les joueurs est désactivé");
    }
    await assertUserIsInMatch(tournament.id, match, reporterUserId);
  }

  // Les scores doivent couvrir exactement les joueurs du match.
  const matchPlayerIds = match.players.map((p) => p.playerId);
  const scoredIds = Object.keys(data.scores);
  if (
    scoredIds.length !== matchPlayerIds.length ||
    !matchPlayerIds.every((id) => id in data.scores)
  ) {
    throw new TournamentError("invalid", "Les scores doivent être fournis pour chaque joueur du match");
  }

  let winnerIds: string[];
  if (data.winnerIds !== undefined) {
    if (!data.winnerIds.every((id) => matchPlayerIds.includes(id))) {
      throw new TournamentError("invalid", "Les vainqueurs doivent être des joueurs du match");
    }
    winnerIds = data.winnerIds;
  } else {
    // Par défaut : les joueurs au score maximal gagnent ; tous à égalité = nul.
    const maxScore = Math.max(...matchPlayerIds.map((id) => data.scores[id]));
    const top = matchPlayerIds.filter((id) => data.scores[id] === maxScore);
    winnerIds = top.length === matchPlayerIds.length ? [] : top;
  }

  const updatedPlayers: TournamentMatchPlayer[] = match.players.map((p) => ({
    playerId: p.playerId,
    score: data.scores[p.playerId],
  }));

  // Sans confirmation requise (ou pour un organisateur), le résultat est final.
  const needsConfirmation = tournament.settings.requireConfirmation && !organizer;

  const set: Record<string, unknown> = {
    players: updatedPlayers,
    winnerIds,
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
    await assertUserIsInMatch(tournament.id, match, confirmerUserId);
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
    await assertUserIsInMatch(tournament.id, match, disputerUserId);
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
 * Classement multijoueur : généralise le calcul 2-joueurs de
 * lib/utils/pairing.ts (mêmes points et tiebreakers) aux matchs à N joueurs.
 * Pour un match à 2, le comportement est identique à calculateStandings.
 * - vainqueurs (winnerIds) : victoire, 3 points ; autres joueurs : défaite ;
 *   winnerIds vide sur un match terminé : nul pour tous, 1 point chacun.
 * - BYE (1 seul joueur) : victoire automatique.
 * - gamesWon = son score ; gamesLost = somme des scores adverses.
 */
function calculateMultiplayerStandings(
  playerIds: string[],
  matches: TournamentMatch[]
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

    for (const matchPlayer of match.players) {
      const standing = standings.get(matchPlayer.playerId);
      if (!standing) continue;

      standing.gamesWon += matchPlayer.score;
      standing.gamesLost += totalScore - matchPlayer.score;

      if (isBye || match.winnerIds.includes(matchPlayer.playerId)) {
        standing.wins++;
        standing.matchPoints += 3;
      } else if (isDraw) {
        standing.draws++;
        standing.matchPoints += 1;
      } else {
        standing.losses++;
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

  const [players, matchDocs] = await Promise.all([
    listPlayers(tournamentId),
    db.collection<TournamentMatchDb>(MATCHES).find(filter).toArray(),
  ]);

  const standings = calculateMultiplayerStandings(
    players.map((p) => p.id),
    matchDocs.map(toMatch)
  );

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
