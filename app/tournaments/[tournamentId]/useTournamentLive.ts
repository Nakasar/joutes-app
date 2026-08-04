"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { LiveStopwatch, LiveTimer } from "@/lib/tournament-timer";
import type { TournamentLiveDisplay, TournamentPhaseType } from "@/lib/types/Tournament";

export type LiveAnnouncement = {
  id: string;
  message: string;
  level: "info" | "urgent";
  createdAt: string;
};

export type LiveStanding = {
  rank: number;
  name: string;
  matchPoints: number;
  record: string;
  dropped: boolean;
  // Temps de résolution du puzzle, en secondes. null hors phase puzzle, ou tant
  // que le joueur n'a pas terminé.
  puzzleTimeSeconds: number | null;
};

export type LiveMatch = {
  id: string;
  tableNumber: number | null;
  players: string[];
  done: boolean;
};

export type LiveState = {
  name: string;
  announcements: LiveAnnouncement[];
  timer: LiveTimer;
  // Chronomètre des phases puzzle. Il prend la place du minuteur partout où le
  // type de la phase en cours (`phaseType`) est « puzzle ».
  stopwatch: LiveStopwatch;
  phaseType: TournamentPhaseType | null;
  serverNow: string;
  // Panneau demandé par l'organisateur pour l'écran de la salle. Les deux
  // listes ne sont servies que par le panneau qui les affiche.
  display: TournamentLiveDisplay;
  roundNumber: number | null;
  standings: LiveStanding[] | null;
  matches: LiveMatch[] | null;
};

/**
 * Interroge périodiquement l'état « live » du tournoi (annonces + minuteur) et
 * calcule le décalage d'horloge serveur/client (`serverOffsetMs`) pour un
 * décompte synchronisé. Lecture publique (endpoint /live).
 */
export function useTournamentLive(tournamentId: string, pollMs = 8000) {
  const t = useTranslations("Tournaments");
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
      setError(t("playerLive.loadLiveError"));
    }
  }, [tournamentId, t]);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { state, serverOffsetMs, error, reload: load };
}
