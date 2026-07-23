"use client";

import { use } from "react";
import { PlayerShell } from "../PlayerShell";
import { usePlayerTournament } from "../usePlayerTournament";
import { RoundHistoryBrowser } from "../../RoundHistoryBrowser";

export default function TournamentPlayerStandingsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { syncKey, tournament, myPlayerId, error, loading } = usePlayerTournament(tournamentId);

  return (
    <PlayerShell
      tournamentId={tournamentId}
      active="standings"
      tournament={tournament}
      syncKey={syncKey}
      myPlayerId={myPlayerId}
      loading={loading}
      error={error}
    >
      <RoundHistoryBrowser tournamentId={tournamentId} canManage={false} syncKey={syncKey} />
    </PlayerShell>
  );
}
