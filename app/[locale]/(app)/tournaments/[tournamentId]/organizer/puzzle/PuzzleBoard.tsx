"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";
import { Check, Clock, LayoutGrid, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { cn } from "@/lib/utils.ts";
import {
  formatDuration,
  formatStopwatch,
  stopwatchElapsedSeconds,
  stopwatchIsPaused,
} from "@/lib/tournament-timer.ts";
import { OrganizerPageHeader } from "../OrganizerPageHeader.tsx";
import { useTournamentLive } from "../../useTournamentLive.ts";

export type PuzzleBoardRow = {
  playerId: string;
  displayName: string;
  discriminator?: string;
  dropped: boolean;
  // Temps relevé, ou null tant que le joueur n'a pas terminé.
  durationSeconds: number | null;
  selfReported: boolean;
  // Table attribuée pour ce puzzle, ou null tant que le joueur n'en a pas.
  tableNumber: number | null;
};

// Borne du temps saisissable, alignée sur le schéma de l'API.
const MAX_SECONDS = 86400;

/**
 * Champ de table d'un joueur, saisi en ligne : la valeur part au serveur quand
 * on quitte le champ ou qu'on valide, et seulement si elle a changé. Vider le
 * champ retire la table. Un champ par ligne plutôt qu'une modale : pendant
 * l'installation de la salle, l'organisateur corrige dix tables d'affilée.
 */
function SeatInput({
  row,
  busy,
  onChange,
}: {
  row: PuzzleBoardRow;
  busy: boolean;
  onChange: (tableNumber: number | null) => Promise<boolean>;
}) {
  const t = useTranslations("Tournaments");
  const [value, setValue] = useState(row.tableNumber === null ? "" : String(row.tableNumber));

  // La ligne est rendue par le serveur : après un enregistrement (ou une
  // attribution en masse), c'est elle qui fait foi sur le champ.
  useEffect(() => {
    setValue(row.tableNumber === null ? "" : String(row.tableNumber));
  }, [row.tableNumber]);

  const commit = async () => {
    const trimmed = value.trim();
    const next = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    if (next !== null && (!Number.isFinite(next) || next < 1 || next > 9999)) {
      setValue(row.tableNumber === null ? "" : String(row.tableNumber));
      return;
    }
    if (next === row.tableNumber) return;
    const ok = await onChange(next);
    if (!ok) setValue(row.tableNumber === null ? "" : String(row.tableNumber));
  };

  return (
    <Input
      type="number"
      inputMode="numeric"
      min={1}
      max={9999}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      disabled={busy || row.dropped}
      placeholder="—"
      aria-label={t("puzzleBoard.seatAria", { name: row.displayName })}
      className="h-8 w-20 text-right font-mono tabular-nums"
    />
  );
}

/**
 * Tableau de bord d'une phase de puzzle : le chronomètre commun en haut, et
 * dessous la liste des joueurs avec, pour chacun, sa table et un bouton
 * « terminé » qui relève le temps affiché. C'est l'écran que l'organisateur
 * garde ouvert pendant que la salle joue — d'où le chronomètre et les temps
 * sur la même page, plutôt que sur deux onglets à faire dialoguer.
 *
 * Les tables se distribuent d'un bouton : un puzzle n'a pas de match, donc
 * rien qui porte un numéro de table, et pourtant chacun doit savoir où
 * s'installer. Chaque joueur placé en est prévenu sur son téléphone.
 */
export function PuzzleBoard({
  tournamentId,
  phaseId,
  phaseName,
  puzzleName,
  rows,
}: {
  tournamentId: string;
  phaseId: string;
  phaseName: string;
  // Nom du puzzle, repris du premier scénario de la phase quand il est renseigné.
  puzzleName?: string;
  rows: PuzzleBoardRow[];
}) {
  const t = useTranslations("Tournaments");
  const router = useRouter();
  const { state, serverOffsetMs, reload } = useTournamentLive(tournamentId, 5000);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Joueur dont on corrige le temps (modale). null = modale fermée.
  const [editing, setEditing] = useState<PuzzleBoardRow | null>(null);
  const [minutes, setMinutes] = useState("0");
  const [seconds, setSeconds] = useState("0");
  // Confirmation avant de redistribuer toutes les tables : chaque joueur dont
  // la table change est prévenu, le geste n'est pas anodin en pleine salle.
  const [confirmReset, setConfirmReset] = useState(false);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const stopwatch = state?.stopwatch ?? null;
  const elapsed = stopwatchElapsedSeconds(stopwatch, serverOffsetMs);
  const running = stopwatch?.running ?? false;
  const paused = stopwatchIsPaused(stopwatch);

  // Les joueurs qui ont terminé remontent, dans l'ordre du classement ; les
  // autres suivent dans l'ordre d'inscription, prêts à être pointés.
  const ordered = useMemo(() => {
    const done = rows
      .filter((row) => row.durationSeconds !== null)
      .sort((a, b) => (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0));
    const pending = rows.filter((row) => row.durationSeconds === null);
    return [...done, ...pending];
  }, [rows]);

  const finishedCount = rows.filter((row) => row.durationSeconds !== null).length;
  const activeRows = rows.filter((row) => !row.dropped);
  const seatedCount = activeRows.filter((row) => row.tableNumber !== null).length;
  const unseatedCount = activeRows.length - seatedCount;

  const call = async (path: string, init: RequestInit, fallbackKey: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t(fallbackKey));
      }
      // Les temps sont rendus par le serveur : le rafraîchissement de la route
      // est la seule source de vérité de la liste.
      router.refresh();
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t(fallbackKey));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const stopwatchAction = (action: "start" | "pause" | "resume" | "reset") =>
    call(
      `/api/tournaments/${tournamentId}/stopwatch`,
      { method: "POST", body: JSON.stringify({ action }) },
      "stopwatch.error"
    );

  const toggleStopwatch = () => {
    if (running) return stopwatchAction("pause");
    if (paused) return stopwatchAction("resume");
    return stopwatchAction("start");
  };

  const base = `/api/tournaments/${tournamentId}/phases/${phaseId}/puzzle-results`;

  const markFinished = (playerId: string) =>
    call(base, { method: "POST", body: JSON.stringify({ playerId }) }, "puzzleBoard.recordError");

  const clearResult = (playerId: string) =>
    call(`${base}/${playerId}`, { method: "DELETE" }, "puzzleBoard.clearError");

  const seatsBase = `/api/tournaments/${tournamentId}/phases/${phaseId}/puzzle-seats`;

  const assignSeats = async (reset: boolean) => {
    const ok = await call(
      seatsBase,
      { method: "POST", body: JSON.stringify({ reset }) },
      "puzzleBoard.assignError"
    );
    if (ok) setConfirmReset(false);
  };

  const setSeat = (playerId: string, tableNumber: number | null) =>
    tableNumber === null
      ? call(`${seatsBase}/${playerId}`, { method: "DELETE" }, "puzzleBoard.seatError")
      : call(
          `${seatsBase}/${playerId}`,
          { method: "PUT", body: JSON.stringify({ tableNumber }) },
          "puzzleBoard.seatError"
        );

  const openEditor = (row: PuzzleBoardRow) => {
    const value = Math.max(0, row.durationSeconds ?? Math.round(elapsed ?? 0));
    setMinutes(String(Math.floor(value / 60)));
    setSeconds(String(value % 60));
    setEditing(row);
  };

  const editedSeconds = (() => {
    const m = Number.parseInt(minutes, 10);
    const s = Number.parseInt(seconds, 10);
    return (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(s) ? s : 0);
  })();
  const editedValid = editedSeconds >= 0 && editedSeconds <= MAX_SECONDS;

  const applyEdit = async () => {
    if (!editing || !editedValid) return;
    // Un joueur sans temps relevé n'a rien à corriger : la saisie vaut alors
    // relevé initial, avec le temps choisi par l'organisation.
    const ok =
      editing.durationSeconds === null
        ? await call(
            base,
            {
              method: "POST",
              body: JSON.stringify({
                playerId: editing.playerId,
                durationSeconds: editedSeconds,
              }),
            },
            "puzzleBoard.recordError"
          )
        : await call(
            `${base}/${editing.playerId}`,
            { method: "PATCH", body: JSON.stringify({ durationSeconds: editedSeconds }) },
            "puzzleBoard.editError"
          );
    if (ok) setEditing(null);
  };

  return (
    <div>
      <OrganizerPageHeader
        title={t("puzzleBoard.pageTitle")}
        description={
          puzzleName
            ? t("puzzleBoard.pageDescriptionNamed", { phase: phaseName, puzzle: puzzleName })
            : t("puzzleBoard.pageDescription", { phase: phaseName })
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-neutral-950 p-5 text-white">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-300">
            {t("stopwatch.title")}
          </p>
          <p className="mt-1 font-mono text-[56px] font-bold leading-none tracking-tighter tabular-nums">
            {formatStopwatch(elapsed)}
          </p>
          <p className="mt-1.5 text-[13px] text-neutral-400">
            {running
              ? t("stopwatch.running")
              : paused
                ? t("stopwatch.paused")
                : t("stopwatch.notStarted")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={toggleStopwatch} disabled={busy}>
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
            {running
              ? t("stopwatch.pause")
              : paused
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
          <span className="ml-1 text-[13px] text-neutral-400">
            {t("puzzleBoard.finishedCount", { done: finishedCount, total: rows.length })}
          </span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {seatedCount === 0
            ? t("puzzleBoard.noSeats")
            : t("puzzleBoard.seatedCount", { seated: seatedCount, total: activeRows.length })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {seatedCount === 0 ? (
            <Button size="sm" onClick={() => assignSeats(false)} disabled={busy || activeRows.length === 0}>
              <LayoutGrid className="size-3.5" />
              {t("puzzleBoard.assignSeats")}
            </Button>
          ) : (
            <>
              {unseatedCount > 0 && (
                <Button size="sm" onClick={() => assignSeats(false)} disabled={busy}>
                  <LayoutGrid className="size-3.5" />
                  {t("puzzleBoard.assignMissingSeats", { count: unseatedCount })}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)} disabled={busy}>
                <RotateCcw className="size-3.5" />
                {t("puzzleBoard.reassignSeats")}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className="w-12 px-4 py-2.5 text-left font-semibold">#</th>
              <th className="px-4 py-2.5 text-left font-semibold">
                {t("standings.columnPlayer")}
              </th>
              <th className="w-28 px-4 py-2.5 text-right font-semibold">
                {t("puzzleBoard.columnTable")}
              </th>
              <th className="w-28 px-4 py-2.5 text-right font-semibold">
                {t("standings.columnTime")}
              </th>
              <th className="w-64 px-4 py-2.5 text-right font-semibold">
                {t("puzzleBoard.columnActions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row, index) => (
              <tr key={row.playerId} className="border-b last:border-b-0">
                <td className="px-4 py-2.5 font-mono text-[13px] text-muted-foreground">
                  {row.durationSeconds === null ? "—" : index + 1}
                </td>
                <td className={cn("px-4 py-2.5 font-medium", row.dropped && "text-muted-foreground")}>
                  {row.displayName}
                  {row.discriminator && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      #{row.discriminator}
                    </span>
                  )}
                  {row.selfReported && (
                    <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {t("puzzleBoard.selfReported")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end">
                    <SeatInput
                      row={row}
                      busy={busy}
                      onChange={(tableNumber) => setSeat(row.playerId, tableNumber)}
                    />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                  {row.durationSeconds === null ? "—" : formatDuration(row.durationSeconds)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {row.durationSeconds === null && (
                      <Button
                        size="sm"
                        onClick={() => markFinished(row.playerId)}
                        disabled={busy || elapsed === null}
                      >
                        <Check className="size-3.5" />
                        {t("puzzleBoard.markFinished")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditor(row)}
                      disabled={busy}
                    >
                      <Clock className="size-3.5" />
                      {t("puzzleBoard.editTime")}
                    </Button>
                    {row.durationSeconds !== null && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => clearResult(row.playerId)}
                        disabled={busy}
                        aria-label={t("puzzleBoard.clearAria", { name: row.displayName })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {ordered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">
                  {t("puzzleBoard.noPlayers")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("puzzleBoard.reassignDialogTitle")}
        description={t("puzzleBoard.reassignDialogDescription")}
        confirmLabel={t("puzzleBoard.reassignSeats")}
        cancelLabel={t("common.cancel")}
        busy={busy}
        onConfirm={() => assignSeats(true)}
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("puzzleBoard.editDialogTitle", { name: editing?.displayName ?? "" })}
            </DialogTitle>
            <DialogDescription>{t("puzzleBoard.editDialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="puzzle-minutes">{t("timerManager.minutes")}</Label>
              <Input
                id="puzzle-minutes"
                type="number"
                min={0}
                max={1440}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="puzzle-seconds">{t("timerManager.seconds")}</Label>
              <Input
                id="puzzle-seconds"
                type="number"
                min={0}
                max={59}
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={applyEdit} disabled={!editedValid || busy}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
