"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Maximize2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDuration, timerRemainingSeconds } from "@/lib/tournament-timer";
import { useTournamentLive } from "../useTournamentLive";

export function TimerManager({ tournamentId }: { tournamentId: string }) {
  const { state, serverOffsetMs, reload } = useTournamentLive(tournamentId, 5000);
  const [minutes, setMinutes] = useState("50");
  const [seconds, setSeconds] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const remaining = timerRemainingSeconds(state?.timer ?? null, serverOffsetMs);
  const expired = remaining !== null && remaining < 0;
  const running = state?.timer?.running ?? false;

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
        throw new Error(data.error ?? "Erreur sur le minuteur");
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur sur le minuteur");
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    const durationSeconds =
      (Number.parseInt(minutes, 10) || 0) * 60 + (Number.parseInt(seconds, 10) || 0);
    if (durationSeconds < 1) {
      setError("La durée doit être d'au moins 1 seconde.");
      return;
    }
    action({ action: "start", durationSeconds });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Minuteur</CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/tournaments/${tournamentId}/timer`} target="_blank">
            <Maximize2 className="mr-2 h-4 w-4" />
            Plein écran
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div
          className={cn(
            "rounded-lg border p-4 text-center",
            expired && "border-destructive/40 bg-destructive/10"
          )}
        >
          <div
            className={cn(
              "font-mono text-5xl font-bold tabular-nums",
              expired && "text-destructive"
            )}
          >
            {remaining === null ? "—" : formatDuration(remaining)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {running ? "En cours" : "Arrêté"}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="timer-min">Minutes</Label>
            <Input
              id="timer-min"
              type="number"
              min={0}
              className="w-24"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="timer-sec">Secondes</Label>
            <Input
              id="timer-sec"
              type="number"
              min={0}
              max={59}
              className="w-24"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
          </div>
          <Button onClick={start} disabled={busy}>
            <Play className="mr-2 h-4 w-4" />
            {running ? "Redémarrer" : "Lancer"}
          </Button>
          <Button variant="outline" onClick={() => action({ action: "stop" })} disabled={busy || !running}>
            <Pause className="mr-2 h-4 w-4" />
            Arrêter
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
