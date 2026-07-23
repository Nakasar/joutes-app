"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/auth-client";
import { getSyncKey } from "@/lib/tournament-sync-storage";
import { usePaginatedSearch } from "@/lib/use-paginated-search";
import { useTabParam } from "@/lib/use-tab-param";
import type { TournamentGameResult, TournamentResultMode } from "@/lib/types/Tournament";
import { MatchGamesEditor } from "../MatchGamesEditor";
import { RoundHistoryBrowser } from "../RoundHistoryBrowser";
import { TablePagination } from "../TablePagination";

type ApiPlayer = { id: string; userId?: string; displayName: string; status: string };
type ApiPhase = {
  id: string;
  name: string;
  type: string;
  status: string;
  order: number;
  bestOf: number;
  resultMode: TournamentResultMode;
};
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
  const [activePhase, setActivePhase] = useState<ApiPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [tab, setTab] = useTabParam("tab", "match", ["match", "standings", "players"]);
  const playersSearch = usePaginatedSearch(tournament?.players ?? [], (p) => p.displayName, 25);

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
      setActivePhase(activePhase ?? null);

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

  const submitReport = async (games: TournamentGameResult[]) => {
    if (!myMatch) return;
    if (games.length === 0) {
      setError("Renseignez au moins une partie.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/tournaments/${tournamentId}/matches/${myMatch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "report", games }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur lors du rapport du résultat");
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du rapport du résultat");
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
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="match">Mon match</TabsTrigger>
            <TabsTrigger value="standings">Classement</TabsTrigger>
            <TabsTrigger value="players">Joueurs</TabsTrigger>
          </TabsList>

          {/* Mon match */}
          <TabsContent value="match">
            {myMatch && round ? (
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
                          <span className="text-lg font-mono">{p.score}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {myMatch.players.length > 1 &&
                    myMatch.status === "pending" &&
                    tournament?.settings.allowSelfReporting &&
                    activePhase && (
                      <MatchGamesEditor
                        key={`${myMatch.id}-${myMatch.status}`}
                        matchId={myMatch.id}
                        matchPlayerIds={myMatch.players.map((p) => p.playerId)}
                        playerName={playerName}
                        resultMode={activePhase.resultMode}
                        bestOf={activePhase.bestOf}
                        submitting={submitting}
                        submitLabel="Rapporter le résultat"
                        onSubmit={submitReport}
                      />
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
            ) : (
              <p className="text-muted-foreground">
                Vous n&apos;avez pas de match dans la ronde en cours.
              </p>
            )}
          </TabsContent>

          {/* Classement figé + historique */}
          <TabsContent value="standings">
            <RoundHistoryBrowser tournamentId={tournamentId} canManage={false} syncKey={syncKey} />
          </TabsContent>

          {/* Liste des joueurs */}
          <TabsContent value="players">
            <Card>
              <CardHeader>
                <CardTitle>Joueurs</CardTitle>
              </CardHeader>
              <CardContent>
                {tournament && tournament.players.length > 0 ? (
                  <div className="space-y-3">
                    <Input
                      value={playersSearch.query}
                      onChange={(e) => playersSearch.setQuery(e.target.value)}
                      placeholder="Rechercher un joueur..."
                      className="max-w-xs"
                    />
                    <ul className="divide-y">
                      {playersSearch.pageItems.map((player) => (
                        <li key={player.id} className="flex items-center justify-between py-2">
                          <span className={player.id === myPlayerId ? "font-semibold" : ""}>
                            {player.displayName}
                            {player.id === myPlayerId ? " (moi)" : ""}
                          </span>
                          {player.status === "dropped" && <Badge variant="outline">Drop</Badge>}
                        </li>
                      ))}
                      {playersSearch.pageItems.length === 0 && (
                        <li className="py-2 text-sm text-muted-foreground">
                          Aucun joueur ne correspond à la recherche.
                        </li>
                      )}
                    </ul>
                    <TablePagination
                      page={playersSearch.page}
                      totalPages={playersSearch.totalPages}
                      total={playersSearch.total}
                      onPage={playersSearch.setPage}
                    />
                  </div>
                ) : (
                  <p className="text-muted-foreground">Aucun joueur inscrit.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
