import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getPlayerById,
  getStandings,
  listFeatAwards,
  listMatchesByTournament,
  listNotes,
  listPenalties,
} from "@/lib/db/tournaments";
import { getTournamentLeagueContext } from "@/lib/leagues/tournament-results";
import { loadOrganizerContext } from "../../organizerContext";
import {
  PlayerSheet,
  type SheetHistoryEntry,
  type SheetStanding,
} from "./PlayerSheet";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function OrganizerPlayerSheetPage({
  params,
}: {
  params: Promise<{ tournamentId: string; playerId: string }>;
}) {
  const { tournamentId, playerId } = await params;
  const { tournament, players, rounds } = await loadOrganizerContext(tournamentId);

  const player = await getPlayerById(tournamentId, playerId);
  if (!player) notFound();

  const [penalties, notes, matches, standings, featAwards, league, t] = await Promise.all([
    listPenalties(tournamentId, playerId),
    listNotes(tournamentId, playerId),
    listMatchesByTournament(tournamentId),
    getStandings(tournamentId),
    listFeatAwards(tournamentId, { playerId }),
    getTournamentLeagueContext(tournament),
    getTranslations("Tournaments"),
  ]);

  const nameOf = (id: string) =>
    players.find((p) => p.id === id)?.displayName ?? t("roundClient.unknownPlayer");
  const roundsById = new Map(rounds.map((r) => [r.id, r]));

  // Ordre chronologique du tournoi : les numéros de ronde repartent à 1 à
  // chaque phase, seul `createdAt` ordonne l'historique d'un bout à l'autre.
  const playerMatches = matches
    .filter((m) => m.players.some((p) => p.playerId === playerId))
    .sort(
      (a, b) =>
        (roundsById.get(a.roundId)?.createdAt.getTime() ?? 0) -
        (roundsById.get(b.roundId)?.createdAt.getTime() ?? 0)
    );

  const history: SheetHistoryEntry[] = playerMatches.map((match) => {
    const round = roundsById.get(match.roundId);
    const opponents = match.players.filter((p) => p.playerId !== playerId);
    const done = match.status === "completed";
    const won = match.winnerIds.includes(playerId);
    const lost = done && match.winnerIds.length > 0 && !won;
    return {
      roundId: match.id,
      roundNumber: round?.number ?? 0,
      opponentName:
        opponents.length === 0
          ? t("common.bye")
          : opponents.map((p) => nameOf(p.playerId)).join(", "),
      tableNumber: match.tableNumber,
      outcome: !done ? "pending" : won ? "win" : lost ? "loss" : "draw",
      score: done ? match.players.map((p) => p.score).join("–") : "",
    };
  });

  // Match en cours : celui de la dernière ronde non terminée où le joueur est
  // apparié. Sert de raccourci vers sa table depuis la fiche.
  const liveMatch = playerMatches
    .filter((m) => roundsById.get(m.roundId)?.status === "in-progress")
    .pop();
  const liveOpponents = liveMatch?.players.filter((p) => p.playerId !== playerId) ?? [];

  const standingIndex = standings.findIndex((s) => s.playerId === playerId);
  const row = standingIndex >= 0 ? standings[standingIndex] : null;
  const standing: SheetStanding = row
    ? {
        rank: standingIndex + 1,
        matchPoints: row.matchPoints,
        record: `${row.wins}-${row.losses}-${row.draws}`,
      }
    : null;

  return (
    <PlayerSheet
      tournamentId={tournamentId}
      player={{
        id: player.id,
        displayName: player.displayName,
        discriminator: player.discriminator,
        status: player.status,
        checkedInAt: player.checkedInAt?.toISOString(),
        fixedTableNumber: player.fixedTableNumber,
        decklist: player.decklist,
      }}
      hasForm={(tournament.registrationForm?.fields.length ?? 0) > 0}
      standing={standing}
      history={history}
      currentMatch={
        liveMatch
          ? {
              roundId: liveMatch.roundId,
              tableNumber: liveMatch.tableNumber,
              opponentName:
                liveOpponents.length === 0
                  ? t("common.bye")
                  : liveOpponents.map((p) => nameOf(p.playerId)).join(", "),
              status: liveMatch.status,
            }
          : null
      }
      initialPenalties={penalties}
      initialNotes={notes.map((n) => ({
        id: n.id,
        content: n.content,
        roundNumber: n.roundNumber,
        createdAt: n.createdAt.toISOString(),
      }))}
      feats={league?.feats ?? []}
      initialFeatAwards={featAwards.map((a) => ({
        id: a.id,
        featId: a.featId,
        matchId: a.matchId,
        roundNumber: a.roundNumber,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}
