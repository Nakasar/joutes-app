"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { TournamentGameResult } from "@/lib/types/Tournament";
import { MatchGamesEditor } from "../MatchGamesEditor";
import { MatchPlayerName } from "../MatchPlayerName";
import { PlayerShell } from "./PlayerShell";
import { usePlayerTournament, type ApiPhase } from "./usePlayerTournament";

type ApiMatch = {
  id: string;
  players: { playerId: string; score: number }[];
  winnerIds: string[];
  status: "pending" | "in-progress" | "completed" | "disputed";
  reportedBy?: string;
  bracketPosition?: string;
};
type ApiRound = { id: string; number: number; status: string; matches: ApiMatch[] };

export default function TournamentPlayerMatchPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const t = useTranslations("Tournaments");
  const { tournamentId } = use(params);

  const matchStatusLabels: Record<string, string> = {
    pending: t("player.matchStatusPending"),
    "in-progress": t("player.matchStatusInProgress"),
    completed: t("player.matchStatusCompleted"),
    disputed: t("player.matchStatusDisputed"),
  };
  const { syncKey, tournament, myPlayerId, error, loading, apiFetch, reload, session } =
    usePlayerTournament(tournamentId);

  const [round, setRound] = useState<ApiRound | null>(null);
  const [activePhase, setActivePhase] = useState<ApiPhase | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [dropping, setDropping] = useState(false);

  const myStatus = tournament?.players.find((p) => p.id === myPlayerId)?.status;

  const dropTournament = async () => {
    if (!myPlayerId) return;
    setDropping(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/tournaments/${tournamentId}/players/${myPlayerId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "dropped" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("player.dropError"));
      }
      setDropOpen(false);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("player.dropError"));
    } finally {
      setDropping(false);
    }
  };

  // Résout la phase active et charge sa dernière ronde à chaque changement de
  // tournoi (chargement initial et après un rapport de résultat).
  useEffect(() => {
    if (!tournament) {
      setRound(null);
      setActivePhase(null);
      return;
    }
    const phases = [...tournament.phases].sort((a, b) => a.order - b.order);
    const phase =
      phases.find((p) => p.id === tournament.currentPhaseId) ??
      phases.find((p) => p.status === "in-progress") ??
      phases[phases.length - 1];
    setActivePhase(phase ?? null);

    let cancelled = false;
    (async () => {
      if (!phase) {
        setRound(null);
        return;
      }
      const phaseRes = await apiFetch(`/api/tournaments/${tournamentId}/phases/${phase.id}`);
      if (!phaseRes.ok) return;
      const phaseData = await phaseRes.json();
      const rounds: { id: string }[] = phaseData.rounds ?? [];
      const lastRound = rounds[rounds.length - 1];
      if (!lastRound) {
        if (!cancelled) setRound(null);
        return;
      }
      const roundRes = await apiFetch(`/api/tournaments/${tournamentId}/rounds/${lastRound.id}`);
      if (roundRes.ok && !cancelled) setRound(await roundRes.json());
    })();
    return () => {
      cancelled = true;
    };
  }, [tournament, apiFetch, tournamentId]);

  const playersById = useMemo(
    () => new Map((tournament?.players ?? []).map((p) => [p.id, p])),
    [tournament]
  );
  const playerName = (playerId: string) => playersById.get(playerId)?.displayName ?? t("player.unknownPlayer");

  const myMatch = useMemo(() => {
    if (!round || !myPlayerId) return null;
    return round.matches.find((m) => m.players.some((p) => p.playerId === myPlayerId)) ?? null;
  }, [round, myPlayerId]);

  const submitReport = useCallback(
    async (games: TournamentGameResult[]) => {
      if (!myMatch) return;
      if (games.length === 0) {
        setActionError(t("player.reportGamesRequired"));
        return;
      }
      setSubmitting(true);
      setActionError(null);
      try {
        const res = await apiFetch(`/api/tournaments/${tournamentId}/matches/${myMatch.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "report", games }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? t("player.reportError"));
        }
        await reload();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t("player.reportError"));
      } finally {
        setSubmitting(false);
      }
    },
    [myMatch, apiFetch, tournamentId, reload, t]
  );

  const submitAction = async (action: "confirm" | "dispute") => {
    if (!myMatch) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/tournaments/${tournamentId}/matches/${myMatch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("player.genericError"));
      }
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("player.genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PlayerShell
      tournamentId={tournamentId}
      active="match"
      tournament={tournament}
      syncKey={syncKey}
      myPlayerId={myPlayerId}
      loading={loading}
      error={error ?? actionError}
    >
      {/* Statut d'inscription + retrait du tournoi (self-drop). */}
      {myPlayerId && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("player.myRegistration")}</span>
            <Badge variant={myStatus === "dropped" ? "outline" : "secondary"}>
              {myStatus === "dropped" ? t("player.statusDropped") : t("player.statusRegistered")}
            </Badge>
          </div>
          {myStatus === "dropped" ? (
            <span className="text-sm text-muted-foreground">{t("player.leftTournament")}</span>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setDropOpen(true)} disabled={dropping}>
              {t("player.leaveTournament")}
            </Button>
          )}
        </div>
      )}

      {myMatch && round ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                {t("player.myMatchRound", { number: round.number })}
                {myMatch.bracketPosition ? ` (${myMatch.bracketPosition})` : ""}
              </span>
              <Badge variant="outline">{matchStatusLabels[myMatch.status]}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {myMatch.players.length === 1 ? (
              <p className="text-muted-foreground">{t("player.byeAutoWin")}</p>
            ) : (
              <div className="space-y-2">
                {myMatch.players.map((p) => (
                  <div key={p.playerId} className="flex items-center justify-between gap-4">
                    <span className={p.playerId === myPlayerId ? "font-semibold" : ""}>
                      <MatchPlayerName
                        isWinner={myMatch.winnerIds.includes(p.playerId)}
                        name={playerName(p.playerId)}
                      />
                      {p.playerId === myPlayerId ? ` ${t("player.me")}` : ""}
                    </span>
                    <span className="font-mono text-lg">{p.score}</span>
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
                  submitLabel={t("player.reportResult")}
                  onSubmit={submitReport}
                />
              )}
            {myMatch.status === "in-progress" && (
              <div className="flex gap-2">
                {myMatch.reportedBy !== myPlayerId && myMatch.reportedBy !== session?.user?.id && (
                  <Button onClick={() => submitAction("confirm")} disabled={submitting}>
                    {t("player.confirmResult")}
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => submitAction("dispute")}
                  disabled={submitting}
                >
                  {t("player.dispute")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground">{t("player.noCurrentMatch")}</p>
      )}

      <ConfirmDialog
        open={dropOpen}
        onOpenChange={(open) => !open && setDropOpen(false)}
        title={t("player.leaveTournament")}
        description={t("player.leaveDialogDescription")}
        confirmLabel={t("player.leaveTournament")}
        destructive
        busy={dropping}
        onConfirm={dropTournament}
      />
    </PlayerShell>
  );
}
