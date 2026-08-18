"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getPreset } from "@/lib/tournaments/game-presets";
import type { TournamentGameResult } from "@/lib/types/Tournament";
import { MatchGamesEditor } from "../MatchGamesEditor";
import { playerTag } from "../PlayerNameTag";
import { buildQuickResults, type QuickResult } from "../quickResults";
import { PlayerShell } from "./PlayerShell";
import { PuzzleCard } from "./PuzzleCard";
import { ReportSheet } from "./ReportSheet";
import { usePlayerTournament, type ApiPhase } from "./usePlayerTournament";

type ApiMatch = {
  id: string;
  players: { playerId: string; score: number }[];
  winnerIds: string[];
  status: "pending" | "in-progress" | "completed" | "disputed";
  reportedBy?: string;
  bracketPosition?: string;
  tableNumber?: number;
  extensionSeconds?: number;
};
type ApiRound = {
  id: string;
  number: number;
  status: string;
  matches: ApiMatch[];
  // Échéance de l'intervalle, sur une ronde asynchrone. Absente en direct.
  deadlineAt?: string;
  scenario?: { id: string; name: string; description?: string };
};
type ApiStanding = {
  playerId: string;
  matchPoints: number;
  wins: number;
  losses: number;
  draws: number;
};

export default function TournamentPlayerMatchPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const t = useTranslations("Tournaments");
  // Luxon suit la locale du runtime par défaut : la date et le délai de
  // l'échéance doivent parler la langue du portail.
  const locale = useLocale();
  const { tournamentId } = use(params);

  const { syncKey, tournament, myPlayerId, error, loading, apiFetch, reload, session } =
    usePlayerTournament(tournamentId);

  const [round, setRound] = useState<ApiRound | null>(null);
  const [activePhase, setActivePhase] = useState<ApiPhase | null>(null);
  const [standings, setStandings] = useState<ApiStanding[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailedOpen, setDetailedOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const myStatus = tournament?.players.find((p) => p.id === myPlayerId)?.status;

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

      // Classement courant : sert le rang et le bilan affichés sous le match.
      const standingsRes = await apiFetch(`/api/tournaments/${tournamentId}/standings`);
      if (standingsRes.ok && !cancelled) {
        const data = await standingsRes.json();
        if (Array.isArray(data)) setStandings(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournament, apiFetch, tournamentId]);

  const playersById = useMemo(
    () => new Map((tournament?.players ?? []).map((p) => [p.id, p])),
    [tournament]
  );
  // Le discriminateur accompagne le pseudo partout côté joueur : c'est le seul
  // moyen de distinguer deux homonymes quand on cherche son adversaire en salle.
  const playerName = (playerId: string) => {
    const player = playersById.get(playerId);
    return player ? playerTag(player.displayName, player.discriminator) : t("player.unknownPlayer");
  };

  const myMatch = useMemo(() => {
    if (!round || !myPlayerId) return null;
    return round.matches.find((m) => m.players.some((p) => p.playerId === myPlayerId)) ?? null;
  }, [round, myPlayerId]);

  const opponent = myMatch?.players.find((p) => p.playerId !== myPlayerId);
  const opponentPlayer = opponent ? playersById.get(opponent.playerId) : undefined;
  const opponentName = opponent ? playerName(opponent.playerId) : t("common.bye");

  const myRankIndex = standings.findIndex((s) => s.playerId === myPlayerId);
  const myStanding = myRankIndex >= 0 ? standings[myRankIndex] : null;
  const opponentStanding = opponent
    ? standings.find((s) => s.playerId === opponent.playerId)
    : undefined;

  const report = useCallback(
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
        setSheetOpen(false);
        setDetailedOpen(false);
        await reload();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t("player.reportError"));
      } finally {
        setSubmitting(false);
      }
    },
    [myMatch, apiFetch, tournamentId, reload, t]
  );

  const submitAction = async (action: "confirm" | "dispute" | "clear") => {
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

  const dropTournament = async () => {
    if (!myPlayerId) return;
    setSubmitting(true);
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
      setSubmitting(false);
    }
  };

  const isBye = myMatch?.players.length === 1;
  const canSelfReport = tournament?.settings.allowSelfReporting && !isBye;
  const notReported = myMatch?.status === "pending";
  const awaitingConfirmation = myMatch?.status === "in-progress";
  const quickResults =
    myMatch && activePhase && activePhase.resultMode === "selection"
      ? buildQuickResults(activePhase.bestOf, myMatch.players.map((p) => p.playerId))
      : [];
  const extensionMinutes = Math.round((myMatch?.extensionSeconds ?? 0) / 60);
  // Statistiques secondaires à relever. Quand il y en a, les raccourcis de
  // saisie ne suffisent plus : le joueur passe directement par la saisie
  // détaillée, seule à proposer les champs.
  const phaseStats = getPreset(activePhase?.statsPresetKey)?.stats ?? [];
  const requireStats = activePhase?.requireMatchStats ?? false;

  const myScore = myMatch?.players.find((p) => p.playerId === myPlayerId)?.score ?? 0;
  const theirScore = opponent?.score ?? 0;

  const statusLabel = !myMatch
    ? ""
    : myMatch.status === "completed"
      ? t("player.matchStatusCompleted")
      : myMatch.status === "disputed"
        ? t("player.matchStatusDisputed")
        : myMatch.status === "in-progress"
          ? t("player.matchStatusInProgress")
          : t("player.matchStatusPending");

  const pickQuickResult = (result: QuickResult) => report(result.games);

  return (
    <PlayerShell
      tournamentId={tournamentId}
      active="match"
      tournament={tournament}
      syncKey={syncKey}
      myPlayerId={myPlayerId}
      loading={loading}
      error={error ?? actionError}
      roundLabel={
        round && activePhase
          ? `${t("common.roundN", { number: round.number })} · ${activePhase.name}`
          : undefined
      }
      deadlineAt={round?.deadlineAt}
    >
      {/* Phase puzzle : ni table ni adversaire, la carte de match n'a rien à
          montrer. Le chronomètre de la salle et le « j'ai fini » la remplacent. */}
      {activePhase?.type === "time-race" ? (
        <PuzzleCard
          tournamentId={tournamentId}
          phaseId={activePhase.id}
          myPlayerId={myPlayerId}
          allowSelfReporting={tournament?.settings.allowSelfReporting ?? false}
          disabled={submitting || myStatus === "dropped" || !myPlayerId}
          scenario={round?.scenario}
          apiFetch={apiFetch}
        />
      ) : myMatch && round ? (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            {/* Sur un intervalle de ligue, il n'y a pas de table : ce qui
                compte est la date avant laquelle la partie doit être jouée. */}
            {round.deadlineAt ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {t("player.playBefore")}
                </p>
                {/* La carte dit quand ; le délai restant vit dans l'en-tête,
                    qui seul connaît l'heure du serveur. Deux décomptes qui
                    peuvent diverger valent moins qu'un seul qui fait foi. */}
                <p className="my-1.5 mb-3 text-[26px] font-bold leading-tight tracking-tight">
                  {DateTime.fromISO(round.deadlineAt)
                    .setLocale(locale)
                    .toFormat("cccc d LLLL, HH'h'mm")}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {t("player.yourTable")}
                </p>
                <p className="my-1.5 font-mono text-[92px] font-bold leading-none tracking-tighter">
                  {myMatch.tableNumber ?? "—"}
                </p>
              </>
            )}
            {isBye ? (
              <p className="text-sm text-muted-foreground">{t("player.byeAutoWin")}</p>
            ) : (
              <>
                <p className="text-[13px] text-muted-foreground">{t("player.against")}</p>
                {/* Le discriminateur est lisible, pas décoratif : c'est lui qui
                    départage deux joueurs de même pseudo à la table. */}
                <p className="mt-0.5 text-[22px] font-bold tracking-tight">
                  {opponentPlayer?.displayName ?? opponentName}
                  {opponentPlayer?.discriminator && (
                    <span className="ml-1.5 font-mono text-base font-semibold text-muted-foreground">
                      #{opponentPlayer.discriminator}
                    </span>
                  )}
                </p>
                {opponentStanding && (
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {t("player.record", {
                      wins: opponentStanding.wins,
                      losses: opponentStanding.losses,
                      draws: opponentStanding.draws,
                    })}
                  </p>
                )}
              </>
            )}

            <span
              className={cn(
                "mt-3.5 inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold",
                myMatch.status === "completed"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : myMatch.status === "disputed"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {statusLabel}
            </span>

            {round.scenario && (
              <div className="mt-3.5 rounded-xl border bg-muted/40 p-3 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {t("player.scenario")}
                </p>
                <p className="mt-0.5 text-[15px] font-semibold">{round.scenario.name}</p>
                {round.scenario.description && (
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-muted-foreground">
                    {round.scenario.description}
                  </p>
                )}
              </div>
            )}

            {extensionMinutes > 0 && (
              <p className="mt-3 rounded-xl border border-sky-300 bg-sky-50 p-2.5 text-[13px] font-semibold text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300">
                {t("player.extensionGranted", { minutes: extensionMinutes })}
              </p>
            )}
          </div>

          {canSelfReport && notReported && (
            <Button
              className="h-auto w-full py-4 text-base font-bold"
              onClick={() =>
                quickResults.length > 0 && phaseStats.length === 0
                  ? setSheetOpen(true)
                  : setDetailedOpen(true)
              }
              disabled={submitting || myStatus === "dropped"}
            >
              {t("player.reportResult")}
            </Button>
          )}

          {myMatch.status === "completed" && !isBye && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-950">
              <p className="text-[15px] font-bold text-emerald-800 dark:text-emerald-300">
                {t("player.resultSent", { mine: myScore, theirs: theirScore })}
              </p>
              {canSelfReport && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2.5"
                  onClick={() => setDetailedOpen(true)}
                  disabled={submitting}
                >
                  {t("player.correct")}
                </Button>
              )}
            </div>
          )}

          {awaitingConfirmation && (
            <div className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">
                {t("player.awaitingConfirmationFrom", { name: opponentName })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {myMatch.reportedBy !== myPlayerId && myMatch.reportedBy !== session?.user?.id && (
                  <Button onClick={() => submitAction("confirm")} disabled={submitting}>
                    {t("player.confirmResult")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => submitAction("dispute")}
                  disabled={submitting}
                >
                  {t("player.dispute")}
                </Button>
              </div>
            </div>
          )}

          <dl className="rounded-xl border bg-muted/40 p-4 text-[13px]">
            <div className="flex justify-between py-1">
              <dt className="text-muted-foreground">{t("player.myRank")}</dt>
              <dd className="font-semibold">
                {myStanding
                  ? t("player.rankOf", { rank: myRankIndex + 1, total: standings.length })
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-muted-foreground">{t("player.myScore")}</dt>
              <dd className="font-semibold">
                {myStanding
                  ? t("player.record", {
                      wins: myStanding.wins,
                      losses: myStanding.losses,
                      draws: myStanding.draws,
                    })
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-muted-foreground">{t("player.myRegistration")}</dt>
              <dd className="font-semibold">
                {myStatus === "dropped"
                  ? t("player.statusDropped")
                  : t("player.statusRegistered")}
              </dd>
            </div>
          </dl>

          {myStatus !== "dropped" && myPlayerId && (
            <Button
              variant="outline"
              className="w-full text-destructive"
              onClick={() => setDropOpen(true)}
              disabled={submitting}
            >
              {t("player.leaveTournament")}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground">{t("player.noCurrentMatch")}</p>
      )}

      {myMatch && myPlayerId && (
        <ReportSheet
          open={sheetOpen}
          myPlayerId={myPlayerId}
          opponentName={opponentName}
          tableNumber={myMatch.tableNumber}
          quickResults={quickResults}
          matchPlayerIds={myMatch.players.map((p) => p.playerId)}
          busy={submitting}
          onClose={() => setSheetOpen(false)}
          onPick={pickQuickResult}
        />
      )}

      {/* Saisie détaillée : formats en points, corrections, et repli quand les
          raccourcis ne s'appliquent pas (match multijoueur). */}
      <Dialog open={detailedOpen} onOpenChange={(open) => !open && setDetailedOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("player.reportResult")}</DialogTitle>
          </DialogHeader>
          {myMatch && activePhase && (
            <MatchGamesEditor
              key={`${myMatch.id}-${myMatch.status}`}
              matchId={myMatch.id}
              matchPlayerIds={myMatch.players.map((p) => p.playerId)}
              playerName={playerName}
              resultMode={activePhase.resultMode}
              bestOf={activePhase.bestOf}
              stats={phaseStats}
              requireStats={requireStats}
              submitting={submitting}
              submitLabel={t("player.reportResult")}
              onSubmit={report}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dropOpen}
        onOpenChange={(open) => !open && setDropOpen(false)}
        title={t("player.leaveTournament")}
        description={t("player.leaveDialogDescription")}
        confirmLabel={t("player.leaveTournament")}
        destructive
        busy={submitting}
        onConfirm={dropTournament}
      />
    </PlayerShell>
  );
}
