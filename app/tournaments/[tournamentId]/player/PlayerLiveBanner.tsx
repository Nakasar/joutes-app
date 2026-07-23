"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Maximize2, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, timerIsPaused, timerRemainingSeconds } from "@/lib/tournament-timer";
import { useTournamentLive } from "../useTournamentLive";

// Bannière « live » du portail joueur : annonces et minuteur synchronisé.
export function PlayerLiveBanner({ tournamentId }: { tournamentId: string }) {
  const { state, serverOffsetMs } = useTournamentLive(tournamentId);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const announcements = state?.announcements ?? [];
  const remaining = timerRemainingSeconds(state?.timer ?? null, serverOffsetMs);
  const expired = remaining !== null && remaining < 0;
  const paused = timerIsPaused(state?.timer ?? null);

  if (announcements.length === 0 && remaining === null) return null;

  return (
    <div className="space-y-3">
      {announcements.map((announcement) => (
        <div
          key={announcement.id}
          className={cn(
            "flex items-start gap-2 rounded-lg border p-3 text-sm",
            announcement.level === "urgent"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "bg-muted/50"
          )}
        >
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="whitespace-pre-wrap">{announcement.message}</span>
        </div>
      ))}

      {remaining !== null && (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border p-3",
            expired && "border-destructive/40 bg-destructive/10"
          )}
        >
          <span className="text-sm text-muted-foreground">
            Minuteur{paused && " (en pause)"}
          </span>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "font-mono text-2xl font-bold tabular-nums",
                expired && "text-destructive"
              )}
            >
              {formatDuration(remaining)}
            </span>
            <Link
              href={`/tournaments/${tournamentId}/timer`}
              target="_blank"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Afficher le minuteur en plein écran"
            >
              <Maximize2 className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
