"use client";

import { useCallback, useEffect, useState } from "react";
import type { LiveTimer } from "@/lib/tournament-timer";

export type LiveAnnouncement = {
  id: string;
  message: string;
  level: "info" | "urgent";
  createdAt: string;
};

export type LiveState = {
  name: string;
  announcements: LiveAnnouncement[];
  timer: LiveTimer;
  serverNow: string;
};

/**
 * Interroge périodiquement l'état « live » du tournoi (annonces + minuteur) et
 * calcule le décalage d'horloge serveur/client (`serverOffsetMs`) pour un
 * décompte synchronisé. Lecture publique (endpoint /live).
 */
export function useTournamentLive(tournamentId: string, pollMs = 8000) {
  const [state, setState] = useState<LiveState | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/live`, { cache: "no-store" });
      if (!res.ok) throw new Error("live");
      const data: LiveState = await res.json();
      setState(data);
      setServerOffsetMs(new Date(data.serverNow).getTime() - Date.now());
      setError(null);
    } catch {
      setError("Impossible de charger l'état du tournoi");
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { state, serverOffsetMs, error, reload: load };
}
