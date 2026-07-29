"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { CalendarClock, Megaphone, Pause, Play, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration, timerIsPaused, timerRemainingSeconds } from "@/lib/tournament-timer";
import { TimerTimeEditor } from "../../TimerTimeEditor";
import { useTournamentLive } from "../../../useTournamentLive";

// Ajout de temps par appui sur « + 2 min », en secondes.
const ADD_SECONDS = 120;

// Report d'échéance accordé par appui sur « + 1 jour ».
const EXTEND_DAYS = 1;

/**
 * Bandeau collant des pages de ronde : repère de ronde, minuteur de la salle et
 * accès direct aux gestes de course (relancer / mettre en pause, ajouter du
 * temps, annoncer, imprimer). Reste visible pendant le défilement des tables.
 *
 * Sur une ronde asynchrone (intervalle de ligue), le minuteur n'a pas de sens :
 * il cède la place à l'échéance de l'intervalle, à son report et à sa clôture.
 */
export function RoundHeaderBar({
  tournamentId,
  roundId,
  roundNumber,
  plannedRounds,
  phaseName,
  tableCount,
  deadlineAt,
  scenarioName,
}: {
  tournamentId: string;
  roundId: string;
  roundNumber: number;
  plannedRounds?: number;
  phaseName: string;
  tableCount: number;
  // Échéance de l'intervalle, en ISO. Absente = ronde jouée en direct.
  deadlineAt?: string;
  scenarioName?: string;
}) {
  const router = useRouter();
  const t = useTranslations("Tournaments");
  const { state, serverOffsetMs, reload } = useTournamentLive(tournamentId, 5000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rafraîchit l'affichage du décompte deux fois par seconde ; l'état du
  // minuteur, lui, reste celui du serveur.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const timer = state?.timer ?? null;
  const remaining = timerRemainingSeconds(timer, serverOffsetMs);
  const running = timer?.running ?? false;
  const paused = timerIsPaused(timer);
  const expired = remaining !== null && remaining < 0;
  const low = remaining !== null && remaining >= 0 && remaining < 300;

  const action = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/timer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("timerManager.timerError"));
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timerManager.timerError"));
    } finally {
      setBusy(false);
    }
  };

  // « + 2 min » redémarre le minuteur sur le temps restant augmenté : l'API ne
  // connaît que « démarrer une durée », l'ajout se calcule donc côté client.
  const addTime = () => {
    const base = remaining ?? timer?.durationSeconds ?? 0;
    action({ action: "start", durationSeconds: Math.max(1, Math.round(base) + ADD_SECONDS) });
  };

  const toggleRun = () => {
    if (running) return action({ action: "pause" });
    if (paused) return action({ action: "resume" });
    return action({ action: "start", durationSeconds: timer?.durationSeconds ?? 3000 });
  };

  // Régler le temps ne doit pas lancer la ronde à l'insu de l'organisateur :
  // l'API ne sait que « démarrer une durée », on remet donc en pause aussitôt
  // quand le minuteur ne tournait pas.
  const setTime = async (seconds: number) => {
    const wasRunning = running;
    await action({ action: "start", durationSeconds: seconds });
    if (!wasRunning) await action({ action: "pause" });
  };

  // Actions sur l'intervalle : report de l'échéance et clôture. Elles passent
  // par la route de ronde, pas par le minuteur.
  const roundAction = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("common.error"));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const deadline = deadlineAt ? DateTime.fromISO(deadlineAt) : null;
  const overdue = deadline ? deadline < DateTime.now() : false;

  const base = `/tournaments/${tournamentId}/organizer`;

  return (
    <div
      data-print-hidden
      className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div>
          <p className="text-lg font-bold tracking-tight">
            {t("common.roundN", { number: roundNumber })}
            {plannedRounds ? (
              <span className="ml-1 font-medium text-muted-foreground">
                {t("roundHeader.ofRounds", { total: plannedRounds })}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {deadline
              ? t("roundHeader.phaseOnly", { phase: phaseName })
              : t("roundHeader.phaseAndTables", { phase: phaseName, count: tableCount })}
            {scenarioName ? ` · ${scenarioName}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {deadline ? (
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-1.5",
                overdue ? "border-destructive/40 bg-destructive/10" : "bg-background"
              )}
            >
              <CalendarClock
                className={cn("size-4", overdue ? "text-destructive" : "text-muted-foreground")}
              />
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  overdue ? "text-destructive" : undefined
                )}
              >
                {overdue
                  ? t("roundHeader.deadlinePassed", { when: deadline.toRelative() ?? "" })
                  : t("roundHeader.deadlineIn", { when: deadline.toRelative() ?? "" })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  roundAction({
                    action: "set-deadline",
                    deadlineAt: deadline.plus({ days: EXTEND_DAYS }).toISO(),
                  })
                }
              >
                {t("roundHeader.extendOneDay")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => roundAction({ action: "close-deadline" })}
              >
                {t("roundHeader.closeInterval")}
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-1.5",
                expired
                  ? "border-destructive/40 bg-destructive/10"
                  : low
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "bg-background"
              )}
            >
              <span
                className={cn(
                  "font-mono text-xl font-semibold tabular-nums",
                  expired ? "text-destructive" : low ? "text-amber-600 dark:text-amber-400" : undefined
                )}
              >
                {remaining === null ? "--:--" : formatDuration(remaining)}
              </span>
              <Button variant="outline" size="sm" onClick={toggleRun} disabled={busy}>
                {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                {running ? t("timerManager.pause") : paused ? t("timerManager.resume") : t("timerManager.start")}
              </Button>
              <Button variant="outline" size="sm" onClick={addTime} disabled={busy}>
                {t("roundHeader.addTwoMinutes")}
              </Button>
              <TimerTimeEditor currentSeconds={remaining} disabled={busy} onApply={setTime} />
            </div>
          )}

          <Button variant="outline" size="sm" asChild>
            <Link href={`${base}/live`}>
              <Megaphone className="size-4" />
              {t("roundHeader.announce")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`${base}/rounds/${roundId}/matches/print`}>
              <Printer className="size-4" />
              {t("matchExport.print")}
            </Link>
          </Button>
        </div>
      </div>

      {error && <p className="px-6 pb-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
