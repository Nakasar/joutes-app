import db from "@/lib/mongodb";
import { ObjectId, WithId } from "mongodb";

const TOURNAMENTS = "tournaments";
const PLAYERS = "tournament-players";
const ROUNDS = "tournament-rounds";

export type PlayGroupResults = {
  /** Nombre de top 8 des membres, tous tournois confondus. */
  topEights: number;
  /** Nombre de tournois terminés auxquels au moins un membre a participé. */
  tournamentsPlayed: number;
  /** Nombre de membres qui ont au moins un classement. */
  rankedMembers: number;
};

export const NO_PLAY_GROUP_RESULTS: PlayGroupResults = {
  topEights: 0,
  tournamentsPlayed: 0,
  rankedMembers: 0,
};

type PlayerRow = { tournamentId: ObjectId; userId?: string; _id: ObjectId };
type StandingRow = { playerId: string };
type RoundRow = {
  tournamentId: ObjectId;
  number: number;
  standings?: StandingRow[];
  standingsValidatedAt?: Date;
};

/**
 * Le palmarès du groupe : ce que ses membres ont fait en tournoi.
 *
 * Agrégé à la lecture plutôt que tenu à jour à l'écriture — un membre qui
 * rejoint le groupe apporte son historique, un membre qui part l'emporte, et
 * un compteur figé se mettrait à mentir au premier mouvement d'effectif.
 *
 * Le classement d'un joueur se lit dans le classement figé de la dernière
 * ronde validée du tournoi : c'est le seul endroit où il existe, les joueurs
 * ne portant pas leur rang. Un tournoi sans ronde validée ne compte donc pas
 * — il a bien été joué, mais son résultat n'a jamais été arrêté.
 */
export async function readPlayGroupResults(memberIds: string[]): Promise<PlayGroupResults> {
  if (memberIds.length === 0) {
    return NO_PLAY_GROUP_RESULTS;
  }

  const playerDocs = (await db
    .collection(PLAYERS)
    .find({ userId: { $in: memberIds } })
    .project({ tournamentId: 1, userId: 1 })
    .toArray()) as WithId<PlayerRow>[];

  if (playerDocs.length === 0) {
    return NO_PLAY_GROUP_RESULTS;
  }

  const tournamentIds = [...new Set(playerDocs.map((doc) => doc.tournamentId.toString()))].map(
    (id) => new ObjectId(id),
  );

  const finishedDocs = await db
    .collection(TOURNAMENTS)
    .find({ _id: { $in: tournamentIds }, status: "completed" })
    .project({ _id: 1 })
    .toArray();

  const finishedIds = new Set(finishedDocs.map((doc) => doc._id.toString()));
  if (finishedIds.size === 0) {
    return NO_PLAY_GROUP_RESULTS;
  }

  const roundDocs = (await db
    .collection(ROUNDS)
    .find({
      tournamentId: { $in: [...finishedIds].map((id) => new ObjectId(id)) },
      standings: { $exists: true, $ne: [] },
    })
    .project({ tournamentId: 1, number: 1, standings: 1, standingsValidatedAt: 1 })
    .toArray()) as WithId<RoundRow>[];

  // La dernière ronde validée de chaque tournoi porte le classement final.
  const lastRoundByTournament = new Map<string, RoundRow>();
  for (const round of roundDocs) {
    const key = round.tournamentId.toString();
    const current = lastRoundByTournament.get(key);
    if (!current || round.number > current.number) {
      lastRoundByTournament.set(key, round);
    }
  }

  const playerIdsByTournament = new Map<string, Set<string>>();
  for (const doc of playerDocs) {
    const key = doc.tournamentId.toString();
    if (!finishedIds.has(key)) {
      continue;
    }

    const set = playerIdsByTournament.get(key) ?? new Set<string>();
    set.add(doc._id.toString());
    playerIdsByTournament.set(key, set);
  }

  const userIdByPlayerId = new Map(playerDocs.map((doc) => [doc._id.toString(), doc.userId]));

  let topEights = 0;
  const ranked = new Set<string>();
  const countedTournaments = new Set<string>();

  for (const [tournamentId, round] of lastRoundByTournament) {
    const memberPlayerIds = playerIdsByTournament.get(tournamentId);
    if (!memberPlayerIds || memberPlayerIds.size === 0) {
      continue;
    }

    const standings = round.standings ?? [];
    let counted = false;

    standings.forEach((standing, index) => {
      if (!memberPlayerIds.has(standing.playerId)) {
        return;
      }

      counted = true;
      const userId = userIdByPlayerId.get(standing.playerId);
      if (userId) {
        ranked.add(userId);
      }

      if (index < 8) {
        topEights += 1;
      }
    });

    if (counted) {
      countedTournaments.add(tournamentId);
    }
  }

  return {
    topEights,
    tournamentsPlayed: countedTournaments.size,
    rankedMembers: ranked.size,
  };
}
