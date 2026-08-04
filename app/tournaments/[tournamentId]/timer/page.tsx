"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  stopwatchElapsedSeconds,
  stopwatchIsPaused,
  timerIsPaused,
  timerRemainingSeconds,
} from "@/lib/tournament-timer";
import { useTournamentLive } from "../useTournamentLive";

export default function TournamentTimerPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const t = useTranslations("Tournaments");
  const { tournamentId } = use(params);
  const { state, serverOffsetMs } = useTournamentLive(tournamentId, 5000);

  // Rafraîchit l'affichage 4 fois par seconde pour un décompte fluide.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Phase puzzle : le chronomètre commun remplace le minuteur. Il monte depuis
  // 0, donc rien n'« expire » et l'écran ne passe jamais au rouge.
  const isPuzzle = state?.phaseType === "puzzle";
  const elapsed = stopwatchElapsedSeconds(state?.stopwatch ?? null, serverOffsetMs);
  const countdown = timerRemainingSeconds(state?.timer ?? null, serverOffsetMs);
  const value = isPuzzle ? elapsed : countdown;
  const expired = !isPuzzle && countdown !== null && countdown < 0;
  const paused = isPuzzle
    ? stopwatchIsPaused(state?.stopwatch ?? null)
    : timerIsPaused(state?.timer ?? null);

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

      {value === null ? (
        <p className={cn("text-3xl", expired ? "text-white" : "text-muted-foreground")}>
          {isPuzzle ? t("stopwatch.notStarted") : t("timerPage.noTimer")}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="font-mono text-[24vw] font-bold leading-none tabular-nums md:text-[20vw]">
            {formatDuration(value)}
          </div>
          {paused && (
            <p className={cn("text-2xl uppercase tracking-widest", expired ? "text-white/80" : "text-muted-foreground")}>
              {t("timerPage.paused")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
