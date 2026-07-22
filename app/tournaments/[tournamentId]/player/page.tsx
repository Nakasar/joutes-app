"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-client";
import { getSyncKey } from "@/lib/tournament-sync-storage";

type ApiPlayer = { id: string; userId?: string; displayName: string; status: string };
type ApiPhase = { id: string; name: string; type: string; status: string; order: number };
type ApiTournament = {
  id: string;
  name: string;
  status: "draft" | "in-progress" | "completed";
  currentPhaseId?: string;
  settings: { allowSelfReporting: boolean; requireConfirmation: boolean };
  phases: ApiPhase[];
  players: ApiPlayer[];
};
type ApiMatch = {
  id: string;
  players: { playerId: string; score: number }[];
  winnerIds: string[];
  status: "pending" | "in-progress" | "completed" | "disputed";
  reportedBy?: string;
  bracketPosition?: string;
};
type ApiRound = { id: string; number: number; status: string; matches: ApiMatch[] };
type ApiStanding = {
  playerId: string;
  displayName: string;
  playerStatus: string;
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
  gamesDiff: number;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "À venir",
  "in-progress": "En cours",
  completed: "Terminé",
};

const MATCH_STATUS_LABELS: Record<string, string> = {
  pending: "À jouer",
  "in-progress": "En attente de confirmation",
  completed: "Terminé",
  disputed: "Contesté",
};

export default function TournamentPlayerPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { data: session } = useSession();

  const [syncKey, setSyncKey] = useState<string | null | undefined>(undefined);
  const [tournament, setTournament] = useState<ApiTournament | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [round, setRound] = useState<ApiRound | null>(null);
  const [standings, setStandings] = useState<ApiStanding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

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

  const loadAll = useCallback(async () => {
    if (syncKey === undefined) return;
    setLoading(true);
    setError(null);
    try {
      // Identité du joueur porté par la clé (les invités n'ont pas de compte).
      if (syncKey) {
        const syncRes = await fetch("/api/tournaments/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: [syncKey] }),
        });
        const syncData = await syncRes.json();
        if (Array.isArray(syncData) && syncData[0]?.player?.id) {
          setMyPlayerId(syncData[0].player.id);
        }
      }

      const tournamentRes = await apiFetch(`/api/tournaments/${tournamentId}`);
      if (!tournamentRes.ok) {
        const body = await tournamentRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Impossible de charger le tournoi");
      }
      const tournamentData: ApiTournament = await tournamentRes.json();
      setTournament(tournamentData);

      // Sans clé de synchronisation, un joueur inscrit avec son compte est
      // identifié via sa session (userId présent sur les joueurs du tournoi).
      if (!syncKey && session?.user?.id) {
        const sessionPlayer = tournamentData.players.find((p) => p.userId === session.user.id);
        if (sessionPlayer) {
          setMyPlayerId(sessionPlayer.id);
        }
      }

      // Phase active : la phase courante du tournoi, sinon la première en
      // cours, sinon la dernière.
      const phases = [...tournamentData.phases].sort((a, b) => a.order - b.order);
      const activePhase =
        phases.find((p) => p.id === tournamentData.currentPhaseId) ??
        phases.find((p) => p.status === "in-progress") ??
        phases[phases.length - 1];

      if (activePhase) {
        const phaseRes = await apiFetch(`/api/tournaments/${tournamentId}/phases/${activePhase.id}`);
        if (phaseRes.ok) {
          const phaseData = await phaseRes.json();
          const rounds: { id: string }[] = phaseData.rounds ?? [];
          const lastRound = rounds[rounds.length - 1];
          if (lastRound) {
            const roundRes = await apiFetch(`/api/tournaments/${tournamentId}/rounds/${lastRound.id}`);
            if (roundRes.ok) {
              setRound(await roundRes.json());
            }
          } else {
            setRound(null);
          }
        }
      }

      const standingsRes = await apiFetch(`/api/tournaments/${tournamentId}/standings`);
      if (standingsRes.ok) {
        setStandings(await standingsRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, syncKey, tournamentId, session?.user?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const playersById = useMemo(
    () => new Map((tournament?.players ?? []).map((p) => [p.id, p])),
    [tournament]
  );

  const myMatch = useMemo(() => {
    if (!round || !myPlayerId) return null;
    return round.matches.find((m) => m.players.some((p) => p.playerId === myPlayerId)) ?? null;
  }, [round, myPlayerId]);

  const playerName = (playerId: string) => playersById.get(playerId)?.displayName ?? "Inconnu";

  const submitReport = async () => {
    if (!myMatch) return;
    setSubmitting(true);
    setError(null);
    try {
      const parsedScores: Record<string, number> = {};
      for (const p of myMatch.players) {
        parsedScores[p.playerId] = Number.parseInt(scores[p.playerId] ?? "0", 10) || 0;
      }
      const res = await apiFetch(`/api/tournaments/${tournamentId}/matches/${myMatch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "report", scores: parsedScores }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur lors du rapport du score");
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du rapport du score");
    } finally {
      setSubmitting(false);
    }
  };

  const submitAction = async (action: "confirm" | "dispute") => {
    if (!myMatch) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/tournaments/${tournamentId}/matches/${myMatch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur");
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  if (syncKey === null && !loading && !tournament) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-4">
        <h1 className="text-2xl font-bold">Tournoi non synchronisé</h1>
        <p className="text-muted-foreground">
          Ce navigateur n&apos;est pas synchronisé avec ce tournoi. Scannez le QR code fourni
          par l&apos;organisateur, ou connectez-vous si vous êtes inscrit avec votre compte.
        </p>
        <Button asChild variant="outline">
          <Link href="/tournaments">Mes tournois</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{tournament?.name ?? "Tournoi"}</h1>
          <p className="text-muted-foreground mt-1">Portail joueur</p>
        </div>
        {tournament && (
          <Badge variant="secondary">{STATUS_LABELS[tournament.status] ?? tournament.status}</Badge>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : (
        <>
          {myMatch && round && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>
                    Mon match — Ronde {round.number}
                    {myMatch.bracketPosition ? ` (${myMatch.bracketPosition})` : ""}
                  </span>
                  <Badge variant="outline">{MATCH_STATUS_LABELS[myMatch.status]}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {myMatch.players.length === 1 ? (
                  <p className="text-muted-foreground">BYE — victoire automatique.</p>
                ) : (
                  <div className="space-y-2">
                    {myMatch.players.map((p) => (
                      <div key={p.playerId} className="flex items-center justify-between gap-4">
                        <span className={p.playerId === myPlayerId ? "font-semibold" : ""}>
                          {playerName(p.playerId)}
                          {p.playerId === myPlayerId ? " (moi)" : ""}
                          {myMatch.winnerIds.includes(p.playerId) ? " 🏆" : ""}
                        </span>
                        {myMatch.status === "pending" && tournament?.settings.allowSelfReporting ? (
                          <Input
                            type="number"
                            min={0}
                            className="w-20"
                            value={scores[p.playerId] ?? ""}
                            placeholder={String(p.score)}
                            onChange={(e) =>
                              setScores((s) => ({ ...s, [p.playerId]: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="text-lg font-mono">{p.score}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {myMatch.status === "pending" && tournament?.settings.allowSelfReporting && (
                  <Button onClick={submitReport} disabled={submitting}>
                    Rapporter le score
                  </Button>
                )}
                {myMatch.status === "in-progress" && (
                  <div className="flex gap-2">
                    {myMatch.reportedBy !== myPlayerId && myMatch.reportedBy !== session?.user?.id && (
                      <Button onClick={() => submitAction("confirm")} disabled={submitting}>
                        Confirmer le résultat
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      onClick={() => submitAction("dispute")}
                      disabled={submitting}
                    >
                      Contester
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {round && (
            <section>
              <h2 className="text-xl font-semibold mb-4">Ronde {round.number}</h2>
              <div className="space-y-2">
                {round.matches.map((match) => (
                  <div
                    key={match.id}
                    className="bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between"
                  >
                    <span className="text-sm">
                      {match.players
                        .map((p) => `${playerName(p.playerId)} (${p.score})`)
                        .join(" vs ")}
                      {match.players.length === 1 ? " — BYE" : ""}
                    </span>
                    <Badge variant="outline">{MATCH_STATUS_LABELS[match.status]}</Badge>
                  </div>
                ))}
                {round.matches.length === 0 && (
                  <p className="text-muted-foreground">Aucun match dans cette ronde.</p>
                )}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-xl font-semibold mb-4">Classement</h2>
            <div className="bg-white rounded-lg shadow-md overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joueur</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pts</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">V/N/D</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {standings.map((standing, index) => (
                    <tr
                      key={standing.playerId}
                      className={standing.playerId === myPlayerId ? "bg-blue-50" : ""}
                    >
                      <td className="px-4 py-3 text-sm">{index + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {standing.displayName}
                        {standing.playerStatus === "dropped" ? " (drop)" : ""}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{standing.matchPoints}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">
                        {standing.wins}/{standing.draws}/{standing.losses}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono">
                        {standing.gamesDiff > 0 ? `+${standing.gamesDiff}` : standing.gamesDiff}
                      </td>
                    </tr>
                  ))}
                  {standings.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">
                        Pas encore de classement
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
