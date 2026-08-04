"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { Maximize2, Megaphone, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  stopwatchElapsedSeconds,
  stopwatchIsPaused,
  timerIsPaused,
  timerRemainingSeconds,
} from "@/lib/tournament-timer";
import { TOURNAMENT_LIVE_DISPLAYS, type TournamentLiveDisplay } from "@/lib/types/Tournament";
import { OrganizerPageHeader } from "./OrganizerPageHeader";
import { TimerTimeEditor } from "./TimerTimeEditor";
import { useTournamentLive } from "../useTournamentLive";

export type ApiAnnouncement = {
  id: string;
  message: string;
  level: "info" | "urgent";
  createdAt: string;
};

// Ajout de temps par appui, et durée de ronde par défaut.
const ADD_SECONDS = 120;
const DEFAULT_ROUND_SECONDS = 3000;

/**
 * Écran « parler à la salle » : les messages tout prêts couvrent l'essentiel de
 * ce qu'un organisateur annonce dans une journée, le champ libre le reste, et le
 * panneau de projection reprend le minuteur en grand pour l'écran de la salle.
 */
export function LiveSection({
  tournamentId,
  liveCode,
  roundNumber,
  reportedMatches,
  totalMatches,
  initialAnnouncements,
}: {
  tournamentId: string;
  liveCode: string;
  roundNumber?: number;
  reportedMatches: number;
  totalMatches: number;
  initialAnnouncements: ApiAnnouncement[];
}) {
  const t = useTranslations("Tournaments");
  const { state, serverOffsetMs, reload } = useTournamentLive(tournamentId, 5000);

  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [message, setMessage] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayOverride, setDisplayOverride] = useState<TournamentLiveDisplay | null>(null);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  // L'optimisme s'efface dès que le serveur confirme, sinon un changement fait
  // depuis un autre poste ne se verrait plus jamais ici.
  const serverDisplay = state?.display;
  useEffect(() => {
    setDisplayOverride((current) => (current && current === serverDisplay ? null : current));
  }, [serverDisplay]);

  const timer = state?.timer ?? null;
  const remaining = timerRemainingSeconds(timer, serverOffsetMs);
  const running = timer?.running ?? false;
  const paused = timerIsPaused(timer);
  const expired = remaining !== null && remaining < 0;
  const low = remaining !== null && remaining >= 0 && remaining < 300;

  // Phase puzzle : le décompte n'a plus de sens, la salle suit un chronomètre
  // parti de 0 — c'est lui qui donne le temps enregistré pour chaque joueur.
  const isPuzzle = state?.phaseType === "time-race";
  const stopwatch = state?.stopwatch ?? null;
  const elapsed = stopwatchElapsedSeconds(stopwatch, serverOffsetMs);
  const stopwatchRunning = stopwatch?.running ?? false;
  const stopwatchPaused = stopwatchIsPaused(stopwatch);

  // Messages tout prêts : le libellé sert de bouton, le texte est ce que voient
  // les joueurs. Les urgents passent en rouge sur leur téléphone.
  const presets: { key: string; urgent: boolean }[] = [
    { key: "fiveMinutes", urgent: false },
    { key: "roundEnd", urgent: true },
    { key: "pairingsPosted", urgent: false },
    { key: "break", urgent: false },
  ];

  const publish = async (text: string, level: "info" | "urgent") => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), level }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("announcements.createError"));
      }
      const created: ApiAnnouncement = await res.json();
      setAnnouncements((current) => [created, ...current]);
      setMessage("");
      setUrgent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("announcements.createError"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/announcements/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("announcements.deleteError"));
      }
      setAnnouncements((current) => current.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("announcements.deleteError"));
    } finally {
      setBusy(false);
    }
  };

  const timerAction = async (body: Record<string, unknown>) => {
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

  const toggleRun = () => {
    if (running) return timerAction({ action: "pause" });
    if (paused) return timerAction({ action: "resume" });
    return timerAction({
      action: "start",
      durationSeconds: timer?.durationSeconds ?? DEFAULT_ROUND_SECONDS,
    });
  };

  const stopwatchAction = async (action: "start" | "pause" | "resume" | "reset") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/stopwatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("stopwatch.error"));
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("stopwatch.error"));
    } finally {
      setBusy(false);
    }
  };

  const toggleStopwatch = () => {
    if (stopwatchRunning) return stopwatchAction("pause");
    if (stopwatchPaused) return stopwatchAction("resume");
    return stopwatchAction("start");
  };

  const addTime = () => {
    const base = remaining ?? timer?.durationSeconds ?? 0;
    timerAction({ action: "start", durationSeconds: Math.max(1, Math.round(base) + ADD_SECONDS) });
  };

  // Régler le temps ne relance pas un minuteur à l'arrêt : on le remet en pause
  // sur la nouvelle valeur, l'organisateur lance quand il l'a annoncé en salle.
  const setTime = async (seconds: number) => {
    const wasRunning = running;
    await timerAction({ action: "start", durationSeconds: seconds });
    if (!wasRunning) await timerAction({ action: "pause" });
  };

  // Panneau montré sur l'écran de la salle. Optimiste : le bouton s'allume tout
  // de suite, l'écran suit à son prochain sondage.
  const setDisplay = async (next: TournamentLiveDisplay) => {
    setDisplayOverride(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveDisplay: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("live.displayError"));
      }
      await reload();
    } catch (err) {
      setDisplayOverride(null);
      setError(err instanceof Error ? err.message : t("live.displayError"));
    } finally {
      setBusy(false);
    }
  };

  // L'état serveur fait foi dès qu'il est revenu : l'optimisme ne sert qu'à
  // couvrir l'aller-retour.
  const currentDisplay: TournamentLiveDisplay = displayOverride ?? state?.display ?? "timer";

  const projectionPath = `/t/${liveCode}`;
  const projectionUrl = `joutes.app${projectionPath}`;

  return (
    <div>
      <OrganizerPageHeader
        title={t("live.pageTitle")}
        description={t("live.pageDescription")}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="min-w-0 flex-1 lg:max-w-xl">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2.5 text-[13px] font-semibold">{t("live.presetsTitle")}</h2>
            <div className="mb-3.5 flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.key}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() =>
                    publish(t(`live.presets.${preset.key}.text`), preset.urgent ? "urgent" : "info")
                  }
                >
                  {t(`live.presets.${preset.key}.label`)}
                </Button>
              ))}
            </div>

            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("live.customPlaceholder")}
              maxLength={500}
              className="min-h-20"
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox checked={urgent} onCheckedChange={(v) => setUrgent(v === true)} />
                {t("live.urgentLabel")}
              </label>
              <Button
                onClick={() => publish(message, urgent ? "urgent" : "info")}
                disabled={busy || !message.trim()}
              >
                <Megaphone className="size-4" />
                {t("announcements.publish")}
              </Button>
            </div>
          </section>

          <div className="mt-5">
            <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {t("live.postedTitle")}
            </h2>
            {announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("announcements.empty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {announcements.map((a) => (
                  <li
                    key={a.id}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-xl border p-3",
                      a.level === "urgent" && "border-destructive/40 bg-destructive/10"
                    )}
                  >
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "whitespace-pre-wrap text-sm leading-snug",
                          a.level === "urgent" && "text-destructive"
                        )}
                      >
                        {a.message}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {DateTime.fromISO(a.createdAt).toFormat("HH:mm")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => remove(a.id)}
                      disabled={busy}
                      aria-label={t("announcements.deleteAria")}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <section className="min-w-0 flex-1">
          <div className="rounded-xl bg-neutral-950 p-5 text-white">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-sky-300">
                {t("live.projectionTitle")}
              </span>
              <span className="text-xs text-neutral-400">
                {roundNumber ? t("common.roundN", { number: roundNumber }) : "—"}
              </span>
            </div>

            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
              {t("live.displaysTitle")}
            </p>
            <div className="mb-4 flex flex-wrap gap-1.5 rounded-lg bg-neutral-900 p-1">
              {TOURNAMENT_LIVE_DISPLAYS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDisplay(option)}
                  disabled={busy}
                  aria-pressed={currentDisplay === option}
                  className={cn(
                    "flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                    currentDisplay === option
                      ? "bg-white text-neutral-950"
                      : "text-neutral-400 hover:text-white"
                  )}
                >
                  {/* En phase puzzle, le panneau « minuteur » projette le
                      chronomètre : le bouton doit annoncer ce qui s'affichera. */}
                  {option === "timer" && isPuzzle
                    ? t("stopwatch.title")
                    : t(`live.displays.${option}`)}
                </button>
              ))}
            </div>

            {isPuzzle ? (
              <>
                <div className="py-4 text-center">
                  <p className="font-mono text-[76px] font-bold leading-none tracking-tighter tabular-nums text-white">
                    {formatDuration(elapsed ?? 0)}
                  </p>
                  <p className="mt-2 text-sm text-neutral-400">
                    {stopwatchRunning
                      ? t("stopwatch.running")
                      : stopwatchPaused
                        ? t("stopwatch.paused")
                        : t("stopwatch.notStarted")}
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={toggleStopwatch} disabled={busy}>
                    {stopwatchRunning ? <Pause className="size-4" /> : <Play className="size-4" />}
                    {stopwatchRunning
                      ? t("stopwatch.pause")
                      : stopwatchPaused
                        ? t("stopwatch.resume")
                        : t("stopwatch.start")}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-neutral-700 bg-transparent text-white hover:bg-neutral-800 hover:text-white"
                    onClick={() => stopwatchAction("reset")}
                    disabled={busy}
                  >
                    <RotateCcw className="size-4" />
                    {t("stopwatch.reset")}
                  </Button>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-neutral-800 pt-4 text-[13px] text-neutral-400">
                  <span>{t("stopwatch.livePanelHint")}</span>
                  <span className="font-mono">{projectionUrl}</span>
                </div>
              </>
            ) : (
              <>
                <div className="py-4 text-center">
                  <p
                    className={cn(
                      "font-mono text-[76px] font-bold leading-none tracking-tighter tabular-nums",
                      expired ? "text-red-400" : low ? "text-amber-300" : "text-white"
                    )}
                  >
                    {remaining === null ? "--:--" : formatDuration(remaining)}
                  </p>
                  <p className="mt-2 text-sm text-neutral-400">
                    {expired
                      ? t("timerManager.expired")
                      : running
                        ? t("timerManager.running")
                        : paused
                          ? t("timerManager.paused")
                          : t("timerManager.stopped")}
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={toggleRun} disabled={busy}>
                    {running ? <Pause className="size-4" /> : <Play className="size-4" />}
                    {running
                      ? t("timerManager.pause")
                      : paused
                        ? t("timerManager.resume")
                        : t("timerManager.start")}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-neutral-700 bg-transparent text-white hover:bg-neutral-800 hover:text-white"
                    onClick={addTime}
                    disabled={busy}
                  >
                    {t("roundHeader.addTwoMinutes")}
                  </Button>
                  <TimerTimeEditor
                    currentSeconds={remaining}
                    disabled={busy}
                    className="h-9 border-neutral-700 bg-transparent px-4 text-white hover:bg-neutral-800 hover:text-white"
                    onApply={setTime}
                  />
                  <Button
                    variant="outline"
                    className="border-neutral-700 bg-transparent text-white hover:bg-neutral-800 hover:text-white"
                    onClick={() =>
                      timerAction({
                        action: "start",
                        durationSeconds: timer?.durationSeconds ?? DEFAULT_ROUND_SECONDS,
                      })
                    }
                    disabled={busy}
                  >
                    <RotateCcw className="size-4" />
                    {t("live.resetTimer")}
                  </Button>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-neutral-800 pt-4 text-[13px] text-neutral-400">
                  <span>
                    {t("live.tablesReported", { done: reportedMatches, total: totalMatches })}
                  </span>
                  <span className="font-mono">{projectionUrl}</span>
                </div>
              </>
            )}
          </div>

          <Button variant="outline" className="mt-3 w-full" asChild>
            <Link href={projectionPath} target="_blank" rel="noopener noreferrer">
              <Maximize2 className="size-4" />
              {t("live.openProjection")}
            </Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
