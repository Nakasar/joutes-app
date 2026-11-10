import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import { deleteJoutesResults, upsertJoutesResults } from "@/lib/db/tournament-results";
import {
  buildJoutesResults,
  finalPlacements,
  joutesSourceRef,
  matchRecords,
  type JoutesResultDraft,
  type RecordableMatch,
} from "@/lib/tournaments/results";

/**
 * Écrit les résultats d'un tournoi Joutes terminé dans `tournamentResults`.
 *
 * Lit directement les collections du tournoi plutôt que `lib/db/tournaments.ts`
 * (réservé au serveur Next) : le script de rattrapage passe par ici.
 *
 * Appelé à la clôture du tournoi (route PATCH, outil MCP) et à chaque
 * revalidation d'un classement d'un tournoi déjà terminé. Réécrire est sans
 * risque (voir `upsertJoutesResults`).
 */

type TournamentRow = {
  _id: ObjectId;
  name: string;
  gameId?: string;
  status: string;
  location?: string;
  startsAt?: Date;
  createdAt?: Date;
};

type PlayerRow = { _id: ObjectId; userId?: string };
type PhaseRow = { _id: ObjectId; order: number };
type RoundRow = { phaseId: ObjectId; number: number; standings?: { playerId: string }[] };

export type SyncOutcome =
  | { status: "skipped"; reason: "not-found" | "not-completed" | "no-game" }
  | { status: "synced"; drafts: JoutesResultDraft[]; written: number };

/** Les résultats que le tournoi écrirait, sans écrire : le `--dry-run` du script. */
export async function readJoutesTournamentResults(
  tournamentId: string,
): Promise<Exclude<SyncOutcome, { status: "synced" }> | { status: "ready"; drafts: JoutesResultDraft[] }> {
  if (!ObjectId.isValid(tournamentId)) return { status: "skipped", reason: "not-found" };
  const _id = new ObjectId(tournamentId);

  const tournament = await db.collection<TournamentRow>("tournaments").findOne({ _id });
  if (!tournament) return { status: "skipped", reason: "not-found" };
  if (tournament.status !== "completed") return { status: "skipped", reason: "not-completed" };
  // Sans jeu, le résultat ne se rangerait dans aucune timeline ni méta.
  if (!tournament.gameId) return { status: "skipped", reason: "no-game" };

  const [players, phases, rounds, matches] = await Promise.all([
    db
      .collection<PlayerRow>("tournament-players")
      .find({ tournamentId: _id }, { projection: { userId: 1 } })
      .toArray(),
    db
      .collection<PhaseRow>("tournament-phases")
      .find({ tournamentId: _id }, { projection: { order: 1 } })
      .toArray(),
    db
      .collection<RoundRow>("tournament-rounds")
      .find(
        { tournamentId: _id, "standings.0": { $exists: true } },
        { projection: { phaseId: 1, number: 1, "standings.playerId": 1 } },
      )
      .toArray(),
    db
      .collection<RecordableMatch>("tournament-matches")
      .find({ tournamentId: _id, status: "completed" }, { projection: { players: 1, winnerIds: 1, status: 1, resolution: 1 } })
      .toArray(),
  ]);

  // Le classement d'une phase est celui de sa dernière ronde validée.
  const lastRound = new Map<string, RoundRow>();
  for (const round of rounds) {
    const key = round.phaseId.toString();
    const current = lastRound.get(key);
    if (!current || round.number > current.number) lastRound.set(key, round);
  }

  const placements = finalPlacements(
    phases.map((phase) => ({
      order: phase.order,
      standings: lastRound.get(phase._id.toString())?.standings ?? [],
    })),
  );

  const drafts = buildJoutesResults(
    {
      id: tournamentId,
      name: tournament.name,
      gameId: tournament.gameId,
      date: (tournament.startsAt ?? tournament.createdAt ?? new Date()).toISOString(),
      place: tournament.location?.trim() || undefined,
    },
    players.map((player) => ({ id: player._id.toString(), userId: player.userId })),
    placements,
    matchRecords(matches),
  );

  return { status: "ready", drafts };
}

export async function syncJoutesTournamentResults(tournamentId: string): Promise<SyncOutcome> {
  const read = await readJoutesTournamentResults(tournamentId);
  if (read.status !== "ready") {
    // Rouvert, supprimé ou privé de jeu : un classement qui n'est plus final ne s'affiche pas.
    await deleteJoutesResults(joutesSourceRef(tournamentId));
    return read;
  }

  const written = await upsertJoutesResults(joutesSourceRef(tournamentId), read.drafts);
  return { status: "synced", drafts: read.drafts, written };
}

/**
 * À appeler après une écriture du tournoi : un échec ne doit pas faire échouer
 * la clôture, il se rattrape avec `npm run results:backfill`.
 */
export async function syncJoutesTournamentResultsSafely(tournamentId: string): Promise<void> {
  try {
    await syncJoutesTournamentResults(tournamentId);
  } catch (error) {
    console.error(`Résultats du tournoi ${tournamentId} non écrits`, error);
  }
}
