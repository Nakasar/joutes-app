"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  formatDuration,
  formatStopwatch,
  stopwatchElapsedSeconds,
} from "@/lib/tournament-timer";
import { useTournamentLive } from "../useTournamentLive";

type PuzzleResult = {
  playerId: string;
  durationSeconds: number;
  selfReported: boolean;
};

/**
 * Carte du puzzle en cours, côté joueur. Elle remplace la carte de match : dans
 * une phase puzzle il n'y a ni table ni adversaire, seulement le chronomètre de
 * la salle et le geste de dire « j'ai fini ». Une fois le temps rendu, la carte
 * le fige : c'est le résultat, il n'appartient plus au joueur de le retoucher.
 */
export function PuzzleCard({
  tournamentId,
  phaseId,
  myPlayerId,
  allowSelfReporting,
  disabled,
  scenario,
  apiFetch,
}: {
  tournamentId: string;
  phaseId: string;
  myPlayerId: string | null;
  allowSelfReporting: boolean;
  disabled: boolean;
  scenario?: { name: string; description?: string };
  // Requête authentifiée du portail : elle porte la clé de synchronisation des
  // joueurs invités, qui n'ont pas de session.
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const t = useTranslations("Tournaments");
  const { state, serverOffsetMs } = useTournamentLive(tournamentId, 5000);

  // `null` = temps pas encore chargés (ou chargement échoué), à distinguer
  // d'une liste vide : « 0 joueur a terminé » est une information, pas un repli
  // acceptable quand on n'a simplement rien pu lire.
  const [results, setResults] = useState<PuzzleResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const elapsed = stopwatchElapsedSeconds(state?.stopwatch ?? null, serverOffsetMs);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/tournaments/${tournamentId}/phases/${phaseId}/puzzle-results`);
    // Lecture d'appoint : un échec laisse la carte sans son compteur, il n'y a
    // rien à signaler au joueur.
    setResults(res.ok ? await res.json() : null);
  }, [apiFetch, tournamentId, phaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const declareFinished = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/tournaments/${tournamentId}/phases/${phaseId}/puzzle-results`,
        { method: "POST", body: JSON.stringify({}) }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("puzzle.reportError"));
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("puzzle.reportError"));
    } finally {
      setBusy(false);
    }
  };

  const myResult = results?.find((result) => result.playerId === myPlayerId) ?? null;
  const done = myResult !== null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {done ? t("puzzle.yourTime") : t("puzzle.elapsed")}
        </p>
        <p className="my-1.5 font-mono text-[62px] font-bold leading-none tracking-tighter tabular-nums">
          {done ? formatDuration(myResult.durationSeconds) : formatStopwatch(elapsed)}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {done
            ? t("puzzle.doneHint")
            : elapsed === null
              ? t("stopwatch.notStarted")
              : t("puzzle.runningHint")}
        </p>

        {scenario && (
          <div className="mt-3.5 rounded-xl border bg-muted/40 p-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {t("puzzle.puzzleLabel")}
            </p>
            <p className="mt-0.5 text-[15px] font-semibold">{scenario.name}</p>
            {scenario.description && (
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-muted-foreground">
                {scenario.description}
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!done && allowSelfReporting && (
        <Button
          className="h-auto w-full py-4 text-base font-bold"
          onClick={declareFinished}
          disabled={busy || disabled || elapsed === null}
        >
          {t("puzzle.declareFinished")}
        </Button>
      )}
      {!done && !allowSelfReporting && (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">
          {t("puzzle.organizerOnlyHint")}
        </p>
      )}

      {results !== null && (
        <p className="text-center text-[13px] text-muted-foreground">
          {t("puzzle.finishedCount", { count: results.length })}
        </p>
      )}
    </div>
  );
}
