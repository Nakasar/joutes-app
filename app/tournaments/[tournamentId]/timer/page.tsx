"use client";

import { use, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDuration, timerIsPaused, timerRemainingSeconds } from "@/lib/tournament-timer";
import { useTournamentLive } from "../useTournamentLive";

export default function TournamentTimerPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { state, serverOffsetMs } = useTournamentLive(tournamentId, 5000);

  // Rafraîchit l'affichage 4 fois par seconde pour un décompte fluide.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = timerRemainingSeconds(state?.timer ?? null, serverOffsetMs);
  const expired = remaining !== null && remaining < 0;
  const paused = timerIsPaused(state?.timer ?? null);

  return (
    // Surcouche plein écran (recouvre l'en-tête du site) pour un affichage épuré.
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 p-8 transition-colors",
        expired ? "bg-red-600 text-white" : "bg-background text-foreground"
      )}
    >
      {state?.name && (
        <p className={cn("text-xl md:text-2xl", expired ? "text-white/80" : "text-muted-foreground")}>
          {state.name}
        </p>
      )}

      {remaining === null ? (
        <p className={cn("text-3xl", expired ? "text-white" : "text-muted-foreground")}>
          Aucun minuteur en cours
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="font-mono text-[24vw] font-bold leading-none tabular-nums md:text-[20vw]">
            {formatDuration(remaining)}
          </div>
          {paused && (
            <p className={cn("text-2xl uppercase tracking-widest", expired ? "text-white/80" : "text-muted-foreground")}>
              En pause
            </p>
          )}
        </div>
      )}
    </div>
  );
}
