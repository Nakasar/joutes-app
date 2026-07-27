import { getStandings } from "@/lib/db/tournaments";
import { resolveDisplayPhase } from "@/lib/tournaments/current-round";
import { loadOrganizerContext } from "../organizerContext";
import { StandingsBoard, type StandingsSnapshot } from "./StandingsBoard";

export default async function OrganizerStandingsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { rounds, tournament, phases } = await loadOrganizerContext(tournamentId);

  // Le classement se lit dans la phase en cours : ses rondes validées portent
  // chacune un classement figé, et le classement courant clôt la série. Même
  // résolution que l'export CSV, pour que le fichier corresponde au tableau.
  const phase = resolveDisplayPhase(phases, tournament.currentPhaseId);
  const phaseRounds = phase ? rounds.filter((r) => r.phaseId === phase.id) : [];

  const snapshots: StandingsSnapshot[] = phaseRounds
    .filter((round) => round.standings && round.standings.length > 0)
    .map((round) => ({
      roundId: round.id,
      roundNumber: round.number,
      validatedAt: round.standingsValidatedAt?.toISOString(),
      rows: (round.standings ?? []).map((row) => ({
        playerId: row.playerId,
        displayName: row.displayName,
        discriminator: row.discriminator,
        matchPoints: row.matchPoints,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        gamesWon: row.gamesWon,
        gamesLost: row.gamesLost,
        opponentMatchWinPercentage: row.opponentMatchWinPercentage,
        playerStatus: row.playerStatus,
      })),
    }));

  const current = await getStandings(tournamentId, phase?.id);
  snapshots.push({
    roundId: null,
    roundNumber: null,
    rows: current.map((row) => ({
      playerId: row.playerId,
      displayName: row.displayName,
      discriminator: row.discriminator,
      matchPoints: row.matchPoints,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      gamesWon: row.gamesWon,
      gamesLost: row.gamesLost,
      opponentMatchWinPercentage: row.opponentMatchWinPercentage,
      playerStatus: row.playerStatus,
    })),
  });

  // Ligne de coupe : le top cut de la phase suivante, celle qui se remplira
  // avec les premiers du classement affiché.
  const phaseIndex = phase ? phases.findIndex((p) => p.id === phase.id) : -1;
  const topCut = phaseIndex >= 0 ? phases[phaseIndex + 1]?.topCut : undefined;

  return (
    <div className="p-6">
      <StandingsBoard tournamentId={tournamentId} snapshots={snapshots} topCut={topCut} />
    </div>
  );
}
