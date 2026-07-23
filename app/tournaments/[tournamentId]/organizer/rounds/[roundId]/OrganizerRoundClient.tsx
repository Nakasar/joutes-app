"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  TournamentGameResult,
  TournamentMatch,
  TournamentPlayer,
  TournamentResultMode,
  TournamentRound,
} from "@/lib/types/Tournament";
import { MatchGamesEditor } from "../../../MatchGamesEditor";

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
  resultMode: TournamentResultMode;
  bestOf: number;
};

export function OrganizerRoundClient({
  tournamentId,
  round,
  initialMatches,
  players,
  resultMode,
  bestOf,
}: Props) {
  const [matches, setMatches] = useState<TournamentMatch[]>(initialMatches);
  const [error, setError] = useState<string | null>(null);
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const playerName = (playerId: string) => playersById.get(playerId)?.displayName ?? "Inconnu";

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}`);
    if (res.ok) {
      const data = await res.json();
      setMatches(data.matches ?? []);
    }
  }, [tournamentId, round.id]);

  const submitReport = (match: TournamentMatch, games: TournamentGameResult[]) => {
    if (games.length === 0) {
      setError("Renseignez au moins une partie.");
      return;
    }
    setBusyMatchId(match.id);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "report", games }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Erreur lors de l'enregistrement du résultat");
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement du résultat");
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
                <CardContent className="space-y-3">
                  {isBye ? (
                    <p className="text-sm text-muted-foreground">Victoire automatique.</p>
                  ) : (
                    <>
                      {match.status === "completed" && (
                        <p className="text-sm">
                          Résultat :{" "}
                          {match.players
                            .map(
                              (p) =>
                                `${playerName(p.playerId)} ${p.score}${
                                  match.winnerIds.includes(p.playerId) ? " 🏆" : ""
                                }`
                            )
                            .join(" · ")}
                        </p>
                      )}
                      <MatchGamesEditor
                        key={`${match.id}-${match.updatedAt ?? ""}`}
                        matchId={match.id}
                        matchPlayerIds={match.players.map((p) => p.playerId)}
                        playerName={playerName}
                        resultMode={resultMode}
                        bestOf={bestOf}
                        submitting={busyMatchId === match.id}
                        submitLabel={match.status === "completed" ? "Corriger le résultat" : "Enregistrer"}
                        onSubmit={(games) => submitReport(match, games)}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Button variant="outline" asChild>
        <Link href={`/tournaments/${tournamentId}/organizer/rounds`}>Retour aux rondes</Link>
      </Button>
    </div>
  );
}
