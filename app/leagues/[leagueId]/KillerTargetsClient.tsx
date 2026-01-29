"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle, Loader2, Target } from "lucide-react";
import { League, LeagueParticipant } from "@/lib/types/League";
import {
  generateKillerTargetsAction,
  reportKillerMatchAction,
  confirmKillerMatchAction,
  confirmKillerMatchLairAction,
} from "../actions";

type ParticipantWithUser = LeagueParticipant & {
  user?: {
    id: string;
    username: string;
    displayName?: string;
    discriminator?: string;
    avatar?: string;
  } | null;
};

type KillerTargetsClientProps = {
  leagueId: string;
  league: League;
  participant: LeagueParticipant | null;
  participantsWithUsers: ParticipantWithUser[];
  currentUserId: string;
  ownedLairIds: string[];
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente de résultat",
  REPORTED: "Résultat rapporté",
  CONFIRMED: "Confirmé",
};

function formatPlayerName(participant?: ParticipantWithUser | null) {
  if (!participant?.user) {
    return participant?.userId || "Joueur inconnu";
  }

  if (participant.user.displayName) {
    return participant.user.discriminator
      ? `${participant.user.displayName}#${participant.user.discriminator}`
      : participant.user.displayName;
  }

  return participant.user.username || participant.user.id;
}

function parseDate(value?: string | Date) {
  if (!value) {
    return DateTime.invalid("missing");
  }

  return typeof value === "string"
    ? DateTime.fromISO(value)
    : DateTime.fromJSDate(value);
}

export default function KillerTargetsClient({
  leagueId,
  league,
  participant,
  participantsWithUsers,
  currentUserId,
  ownedLairIds,
}: KillerTargetsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reportForm, setReportForm] = useState<{
    targetId: string;
    matchId?: string;
    playerScores: Record<string, number>;
    playedAt: string;
  } | null>(null);

  const normalizeScores = (
    playerIds: string[],
    playerScores: Record<string, number>
  ) =>
    playerIds.reduce<Record<string, number>>((acc, playerId) => {
      const rawScore = playerScores[playerId];
      const safeScore = Number.isFinite(rawScore) ? Math.max(0, Math.floor(rawScore)) : 0;
      acc[playerId] = safeScore;
      return acc;
    }, {});

  const getWinnerIdFromScores = (
    playerIds: string[],
    playerScores: Record<string, number>
  ) => {
    if (playerIds.length === 0) return undefined;
    const scores = Object.values(playerScores);
    if (scores.length === 0) return undefined;
    const maxScore = Math.max(...scores);
    const winners = playerIds.filter((playerId) => playerScores[playerId] === maxScore);
    return winners.length === 1 ? winners[0] : undefined;
  };

  const getMatchScoreLine = (
    matchScores: Record<string, number> | undefined,
    primaryId: string,
    secondaryId: string,
    primaryLabel: string,
    secondaryLabel: string
  ) => {
    if (!matchScores) return null;
    const primaryScore = matchScores[primaryId];
    const secondaryScore = matchScores[secondaryId];
    if (primaryScore === undefined && secondaryScore === undefined) return null;
    return `${primaryLabel} ${primaryScore ?? 0} - ${secondaryScore ?? 0} ${secondaryLabel}`;
  };

  const requireLair = league.killerConfig?.requireLair ?? true;

  const gameNames = useMemo(
    () => new Map(league.games.map((game) => [game.id, game.name])),
    [league.games]
  );

  const lairNames = useMemo(
    () => new Map(league.lairs.map((lair) => [lair.id, lair.name])),
    [league.lairs]
  );

  const participantMap = useMemo(
    () =>
      new Map(
        participantsWithUsers.map((p) => [p.userId, formatPlayerName(p)])
      ),
    [participantsWithUsers]
  );

  const targets = useMemo(() => {
    return (league.matches || [])
      .filter(
        (match) =>
          match.isKillerMatch && match.playerIds.includes(currentUserId)
      )
      .map((match) => {
        const opponentId = match.playerIds.find((id) => id !== currentUserId) || currentUserId;
        return {
          targetId: opponentId,
          gameId: match.gameId,
          lairId: match.lairId || "",
          assignedAt: match.createdAt,
          status: match.status || "PENDING",
          matchId: match.id,
          reportedBy: match.reportedBy,
          reportedAt: match.reportedAt,
          confirmedBy: match.confirmedBy,
          lairConfirmedBy: match.lairConfirmedBy,
          confirmedAt: match.confirmedAt,
        };
      });
  }, [league.matches, currentUserId]);

  const activeTargets = targets.filter((target) => target.status !== "CONFIRMED");

  const matchesNeedingOpponentConfirmation = league.matches.filter(
    (match) =>
      match.isKillerMatch &&
      match.status === "REPORTED" &&
      match.playerIds.includes(currentUserId) &&
      match.reportedBy !== currentUserId &&
      !match.confirmedBy
  );

  const matchesNeedingLairConfirmation = league.matches.filter(
    (match) =>
      match.isKillerMatch &&
      match.status === "REPORTED" &&
      !match.lairConfirmedBy &&
      !!match.lairId &&
      ownedLairIds.includes(match.lairId)
  );

  const handleGenerateTargets = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await generateKillerTargetsAction(leagueId);
      if (result.success) {
        setSuccess("Cibles mises à jour");
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de la génération des cibles");
      }
    });
  };

  const handleReportMatch = () => {
    if (!reportForm) {
      return;
    }

    const playerIds = [currentUserId, reportForm.targetId];
    const normalizedScores = normalizeScores(playerIds, reportForm.playerScores);
    const computedWinnerId = getWinnerIdFromScores(playerIds, normalizedScores);
    if (!computedWinnerId) {
      setError("Le score doit désigner un vainqueur");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await reportKillerMatchAction(leagueId, {
        ...reportForm,
        winnerId: computedWinnerId,
        playerScores: normalizedScores,
      });
      if (result.success) {
        setSuccess("Résultat envoyé");
        setReportForm(null);
        router.refresh();
      } else {
        setError(result.error || "Erreur lors du rapport du résultat");
      }
    });
  };

  const handleConfirmMatch = (matchId: string) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await confirmKillerMatchAction(leagueId, matchId);
      if (result.success) {
        setSuccess("Résultat confirmé");
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de la confirmation");
      }
    });
  };

  const handleConfirmLair = (matchId: string) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await confirmKillerMatchLairAction(leagueId, matchId);
      if (result.success) {
        setSuccess("Confirmation du lieu enregistrée");
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de la confirmation du lieu");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Mes cibles
        </CardTitle>
        <CardDescription>
          Gérez vos cibles actives et reportez vos résultats.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {!participant && (
          <div className="text-sm text-muted-foreground">
            Vous n&apos;êtes pas inscrit à cette ligue.
          </div>
        )}

        {participant && (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleGenerateTargets} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Obtenir mes matchs
            </Button>
            <span className="text-sm text-muted-foreground">
              {activeTargets.length}/{league.killerConfig?.targets || 1} cibles actives
            </span>
          </div>
        )}

        {participant && activeTargets.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Aucune cible active pour le moment.
          </div>
        )}

        {participant && activeTargets.length > 0 && (
          <div className="space-y-4">
            {activeTargets.map((target) => {
              const targetName = participantMap.get(target.targetId) || target.targetId;
              const gameName = gameNames.get(target.gameId) || target.gameId;
              const lairName = lairNames.get(target.lairId) || target.lairId;
              const assignedDate = parseDate(target.assignedAt).setLocale("fr");
              const match = league.matches.find((m) => m.id === target.matchId);
              const winnerId = match?.winnerIds?.[0];
              const winnerName = winnerId
                ? participantMap.get(winnerId) || winnerId
                : undefined;
              const scoreLine = match
                ? getMatchScoreLine(
                    match.playerScores,
                    currentUserId,
                    target.targetId,
                    "Vous",
                    targetName
                  )
                : null;
              const needsOpponent = !!match?.reportedBy && !match?.confirmedBy;
              const needsLair = requireLair && !match?.lairConfirmedBy;
              const pendingMessage = needsOpponent && needsLair
                ? "Résultat en attente de confirmation par le lieu et l'adversaire."
                : needsOpponent
                ? "Résultat en attente de confirmation par l'adversaire."
                : needsLair
                ? "Résultat en attente de confirmation par le lieu."
                : "Résultat en attente de confirmation.";

              return (
                <div
                  key={`${target.targetId}-${target.gameId}`}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{targetName}</p>
                      <p className="text-sm text-muted-foreground">
                        {gameName} · {lairName}
                      </p>
                      {scoreLine && (
                        <p className="text-sm text-muted-foreground">
                          Score : {scoreLine}
                        </p>
                      )}
                      {assignedDate.isValid && (
                        <p className="text-xs text-muted-foreground">
                          Assigné {assignedDate.toRelative()}
                        </p>
                      )}
                    </div>
                    <Badge variant={target.status === "CONFIRMED" ? "default" : "secondary"}>
                      {STATUS_LABELS[target.status] || "En attente"}
                    </Badge>
                  </div>

                  {target.status !== "CONFIRMED" && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setReportForm({
                              targetId: target.targetId,
                              matchId: target.matchId,
                              playerScores: {
                                [currentUserId]: match?.playerScores?.[currentUserId] ?? 0,
                                [target.targetId]: match?.playerScores?.[target.targetId] ?? 0,
                              },
                              playedAt: match?.playedAt
                                ? DateTime.fromJSDate(new Date(match.playedAt)).toFormat(
                                    "yyyy-LL-dd'T'HH:mm"
                                  )
                                : DateTime.now().toFormat("yyyy-LL-dd'T'HH:mm"),
                            })
                          }
                        >
                          {target.status === "PENDING"
                            ? "Rapporter un résultat"
                            : "Modifier le résultat"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            {target.status === "PENDING"
                              ? "Rapporter un résultat"
                              : "Modifier le résultat"}
                          </DialogTitle>
                          <DialogDescription>
                            Indiquez le score exact et la date du match.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Score Vous</label>
                              <Input
                                type="number"
                                min="0"
                                value={
                                  reportForm?.targetId === target.targetId
                                    ? reportForm.playerScores[currentUserId] ?? 0
                                    : 0
                                }
                                onChange={(event) => {
                                  const score = Number.parseInt(event.target.value, 10);
                                  setReportForm({
                                    targetId: target.targetId,
                                    matchId: target.matchId,
                                    playerScores: {
                                      ...(reportForm?.targetId === target.targetId
                                        ? reportForm.playerScores
                                        : {}),
                                      [currentUserId]: Number.isNaN(score) ? 0 : score,
                                      [target.targetId]:
                                        reportForm?.targetId === target.targetId
                                          ? reportForm.playerScores[target.targetId] ?? 0
                                          : 0,
                                    },
                                    playedAt:
                                      reportForm?.targetId === target.targetId
                                        ? reportForm.playedAt
                                        : DateTime.now().toFormat("yyyy-LL-dd'T'HH:mm"),
                                  });
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                Score {targetName}
                              </label>
                              <Input
                                type="number"
                                min="0"
                                value={
                                  reportForm?.targetId === target.targetId
                                    ? reportForm.playerScores[target.targetId] ?? 0
                                    : 0
                                }
                                onChange={(event) => {
                                  const score = Number.parseInt(event.target.value, 10);
                                  setReportForm({
                                    targetId: target.targetId,
                                    matchId: target.matchId,
                                    playerScores: {
                                      ...(reportForm?.targetId === target.targetId
                                        ? reportForm.playerScores
                                        : {}),
                                      [currentUserId]:
                                        reportForm?.targetId === target.targetId
                                          ? reportForm.playerScores[currentUserId] ?? 0
                                          : 0,
                                      [target.targetId]: Number.isNaN(score) ? 0 : score,
                                    },
                                    playedAt:
                                      reportForm?.targetId === target.targetId
                                        ? reportForm.playedAt
                                        : DateTime.now().toFormat("yyyy-LL-dd'T'HH:mm"),
                                  });
                                }}
                              />
                            </div>
                          </div>
                          {reportForm?.targetId === target.targetId && (() => {
                            const normalizedScores = normalizeScores(
                              [currentUserId, target.targetId],
                              reportForm.playerScores
                            );
                            const winnerId = getWinnerIdFromScores(
                              [currentUserId, target.targetId],
                              normalizedScores
                            );
                            const winnerLabel = winnerId
                              ? winnerId === currentUserId
                                ? "Vous"
                                : targetName
                              : "Egalite";
                            return (
                              <p className="text-sm text-muted-foreground">
                                Vainqueur : {winnerLabel}
                              </p>
                            );
                          })()}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Date du match</label>
                            <Input
                              type="datetime-local"
                              value={
                                reportForm?.targetId === target.targetId
                                  ? reportForm.playedAt
                                  : DateTime.now().toFormat("yyyy-LL-dd'T'HH:mm")
                              }
                              onChange={(event) =>
                                setReportForm({
                                  targetId: target.targetId,
                                  matchId: target.matchId,
                                  playerScores:
                                    reportForm?.targetId === target.targetId
                                      ? reportForm.playerScores
                                      : {
                                          [currentUserId]: 0,
                                          [target.targetId]: 0,
                                        },
                                  playedAt: event.target.value,
                                })
                              }
                            />
                          </div>
                          <Button onClick={handleReportMatch} disabled={isPending}>
                            {isPending && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Envoyer le résultat
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}

                  {target.status === "REPORTED" && (
                    <div className="space-y-1">
                      {winnerName && (
                        <p className="text-sm text-muted-foreground">
                          Résultat : victoire de {winnerName}
                        </p>
                      )}
                      {scoreLine && (
                        <p className="text-sm text-muted-foreground">
                          Score : {scoreLine}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {pendingMessage}
                      </p>
                    </div>
                  )}

                  {target.status === "CONFIRMED" && winnerName && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Résultat confirmé : victoire de {winnerName}
                      </p>
                      {scoreLine && (
                        <p className="text-sm text-muted-foreground">
                          Score : {scoreLine}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(matchesNeedingOpponentConfirmation.length > 0 ||
          matchesNeedingLairConfirmation.length > 0) && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Confirmations en attente</h3>

            {matchesNeedingOpponentConfirmation.map((match) => {
              const opponentId = match.playerIds.find((id) => id !== currentUserId);
              const opponentName = opponentId
                ? participantMap.get(opponentId) || opponentId
                : "Adversaire";
              const winnerId = match.winnerIds?.[0];
              const winnerName = winnerId
                ? participantMap.get(winnerId) || winnerId
                : undefined;
              const scoreLine = getMatchScoreLine(
                match.playerScores,
                currentUserId,
                opponentId || "",
                "Vous",
                opponentName
              );
              const matchDate = parseDate(match.playedAt).setLocale("fr");
              const gameName = gameNames.get(match.gameId) || match.gameId;
              const lairName = match.lairId
                ? lairNames.get(match.lairId) || match.lairId
                : "Lieu inconnu";

              return (
                <div
                  key={`confirm-${match.id}`}
                  className="border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium">{opponentName}</p>
                    <p className="text-sm text-muted-foreground">
                      {gameName} · {lairName}
                    </p>
                    {winnerName && (
                      <p className="text-sm text-muted-foreground">
                        Résultat : victoire de {winnerName}
                      </p>
                    )}
                    {scoreLine && (
                      <p className="text-sm text-muted-foreground">
                        Score : {scoreLine}
                      </p>
                    )}
                    {matchDate.isValid && (
                      <p className="text-xs text-muted-foreground">
                        Joué {matchDate.toRelative()}
                      </p>
                    )}
                  </div>
                  <Button onClick={() => handleConfirmMatch(match.id)} disabled={isPending}>
                    {isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Confirmer
                  </Button>
                </div>
              );
            })}

            {matchesNeedingLairConfirmation.map((match) => {
              const winnerId = match.winnerIds?.[0];
              const winnerName = winnerId
                ? participantMap.get(winnerId) || winnerId
                : undefined;
              const matchPlayers = match.playerIds;
              const scoreLine =
                matchPlayers.length === 2
                  ? getMatchScoreLine(
                      match.playerScores,
                      matchPlayers[0],
                      matchPlayers[1],
                      participantMap.get(matchPlayers[0]) || matchPlayers[0],
                      participantMap.get(matchPlayers[1]) || matchPlayers[1]
                    )
                  : null;
              const matchDate = parseDate(match.playedAt).setLocale("fr");
              const gameName = gameNames.get(match.gameId) || match.gameId;
              const lairName = match.lairId
                ? lairNames.get(match.lairId) || match.lairId
                : "Lieu inconnu";

              return (
                <div
                  key={`lair-${match.id}`}
                  className="border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium">Confirmation du lieu</p>
                    <p className="text-sm text-muted-foreground">
                      {gameName} · {lairName}
                    </p>
                    {winnerName && (
                      <p className="text-sm text-muted-foreground">
                        Résultat : victoire de {winnerName}
                      </p>
                    )}
                    {scoreLine && (
                      <p className="text-sm text-muted-foreground">
                        Score : {scoreLine}
                      </p>
                    )}
                    {matchDate.isValid && (
                      <p className="text-xs text-muted-foreground">
                        Joué {matchDate.toRelative()}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => handleConfirmLair(match.id)}
                    disabled={isPending}
                  >
                    {isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Confirmer côté lieu
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
