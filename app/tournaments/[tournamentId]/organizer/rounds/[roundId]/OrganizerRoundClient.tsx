"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { TournamentMatch, TournamentPlayer, TournamentRound } from "@/lib/types/Tournament";

const MATCH_STATUS_LABELS: Record<string, string> = {
  pending: "À jouer",
  "in-progress": "En attente de confirmation",
  completed: "Terminé",
  disputed: "Contesté",
};

type Props = {
  tournamentId: string;
  round: TournamentRound;
  initialMatches: TournamentMatch[];
  players: TournamentPlayer[];
};

export function OrganizerRoundClient({ tournamentId, round, initialMatches, players }: Props) {
  const [matches, setMatches] = useState<TournamentMatch[]>(initialMatches);
  const [scores, setScores] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);

  const playersById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );
  const playerName = (playerId: string) => playersById.get(playerId)?.displayName ?? "Inconnu";

  const setScore = (matchId: string, playerId: string, value: string) => {
    setScores((current) => ({
      ...current,
      [matchId]: { ...(current[matchId] ?? {}), [playerId]: value },
    }));
  };

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}`);
    if (res.ok) {
      const data = await res.json();
      setMatches(data.matches ?? []);
    }
  }, [tournamentId, round.id]);

  const submitScore = (match: TournamentMatch) => {
    setBusyMatchId(match.id);
    setError(null);
    (async () => {
      try {
        const matchScores: Record<string, number> = {};
        for (const p of match.players) {
          const raw = scores[match.id]?.[p.playerId];
          matchScores[p.playerId] = Number.parseInt(raw ?? String(p.score), 10) || 0;
        }
        const res = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "report", scores: matchScores }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Erreur lors de l'enregistrement du score");
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement du score");
      } finally {
        setBusyMatchId(null);
      }
    })();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Ronde {round.number}</h1>
          <p className="text-muted-foreground mt-1">Saisie des résultats</p>
        </div>
        <Badge variant="secondary">
          {round.status === "completed" ? "Terminée" : "En cours"}
        </Badge>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {matches.length === 0 ? (
          <p className="text-muted-foreground">Aucun match dans cette ronde.</p>
        ) : (
          matches.map((match) => {
            const isBye = match.players.length === 1;
            return (
              <Card key={match.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>
                      {match.bracketPosition ? `${match.bracketPosition} — ` : ""}
                      {match.players.map((p) => playerName(p.playerId)).join(" vs ")}
                      {isBye ? " (BYE)" : ""}
                    </span>
                    <Badge variant="outline">{MATCH_STATUS_LABELS[match.status]}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isBye ? (
                    <p className="text-sm text-muted-foreground">Victoire automatique.</p>
                  ) : (
                    <div className="flex flex-wrap items-end gap-4">
                      {match.players.map((p) => (
                        <div key={p.playerId} className="space-y-1">
                          <label className="text-sm block">
                            {playerName(p.playerId)}
                            {match.winnerIds.includes(p.playerId) ? " 🏆" : ""}
                          </label>
                          <Input
                            type="number"
                            min={0}
                            className="w-24"
                            value={scores[match.id]?.[p.playerId] ?? String(p.score)}
                            onChange={(e) => setScore(match.id, p.playerId, e.target.value)}
                          />
                        </div>
                      ))}
                      <Button onClick={() => submitScore(match)} disabled={busyMatchId === match.id}>
                        Enregistrer
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Button variant="outline" asChild>
        <Link href={`/tournaments/${tournamentId}/organizer`}>Retour au portail organisateur</Link>
      </Button>
    </div>
  );
}
