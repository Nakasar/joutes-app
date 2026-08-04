"use client";

import { useEffect, useState } from "react";
import {
  formatDuration,
  stopwatchElapsedSeconds,
  timerRemainingSeconds,
} from "@/lib/tournament-timer";
import { useTournamentLive } from "./[tournamentId]/useTournamentLive";

/**
 * Minuteur de la ronde en cours — ou chronomètre, sur une phase puzzle —
 * affiché sur la carte du tournoi en direct. Interroge l'état public du
 * tournoi : la liste montre le temps réel de la salle sans que l'organisateur
 * ait à ouvrir le portail.
 */
export function TournamentClock({ tournamentId }: { tournamentId: string }) {
  const { state, serverOffsetMs } = useTournamentLive(tournamentId, 10000);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const value =
    state?.phaseType === "puzzle"
      ? stopwatchElapsedSeconds(state?.stopwatch ?? null, serverOffsetMs)
      : timerRemainingSeconds(state?.timer ?? null, serverOffsetMs);
  if (value === null) return null;

  return (
    <span className="font-mono text-[26px] font-semibold tabular-nums">
      {formatDuration(value)}
    </span>
  );
}
