"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { getSyncKey } from "@/lib/tournament-sync-storage";
import type { TournamentResultMode } from "@/lib/types/Tournament";

export type ApiPlayer = { id: string; userId?: string; displayName: string; status: string };
export type ApiPhase = {
  id: string;
  name: string;
  type: string;
  status: string;
  order: number;
  bestOf: number;
  resultMode: TournamentResultMode;
};
export type ApiTournament = {
  id: string;
  name: string;
  status: "draft" | "in-progress" | "completed";
  currentPhaseId?: string;
  settings: { allowSelfReporting: boolean; requireConfirmation: boolean };
  phases: ApiPhase[];
  players: ApiPlayer[];
};

/**
 * Charge le tournoi côté portail joueur : identité portée par la clé de
 * synchronisation (invités) ou par la session (comptes inscrits). Renvoie de
 * quoi construire les requêtes authentifiées (apiFetch) et savoir si ce
 * navigateur est synchronisé.
 */
export function usePlayerTournament(tournamentId: string) {
  const { data: session } = useSession();

  const [syncKey, setSyncKey] = useState<string | null | undefined>(undefined);
  const [tournament, setTournament] = useState<ApiTournament | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSyncKey(getSyncKey(tournamentId) ?? null);
  }, [tournamentId]);

  const apiFetch = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(path, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...(syncKey ? { Authorization: `Bearer ${syncKey}` } : {}),
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
        },
      }),
    [syncKey]
  );

  const load = useCallback(async () => {
    if (syncKey === undefined) return;
    setLoading(true);
    setError(null);
    try {
      // Identité du joueur porté par la clé (les invités n'ont pas de compte).
      // Best-effort : un échec de résolution n'empêche pas de charger le tournoi.
      if (syncKey) {
        try {
          const syncRes = await fetch("/api/tournaments/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keys: [syncKey] }),
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            if (Array.isArray(syncData) && syncData[0]?.player?.id) {
              setMyPlayerId(syncData[0].player.id);
            }
          }
        } catch {
          // Ignoré : l'identité pourra être résolue via la session si présente.
        }
      }

      const res = await apiFetch(`/api/tournaments/${tournamentId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Impossible de charger le tournoi");
      }
      const data: ApiTournament = await res.json();
      setTournament(data);

      // Sans clé de synchronisation, un joueur inscrit avec son compte est
      // identifié via sa session (userId présent sur les joueurs du tournoi).
      if (!syncKey && session?.user?.id) {
        const sessionPlayer = data.players.find((p) => p.userId === session.user.id);
        if (sessionPlayer) setMyPlayerId(sessionPlayer.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, syncKey, tournamentId, session?.user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return { syncKey, tournament, myPlayerId, error, loading, apiFetch, reload: load, session };
}
