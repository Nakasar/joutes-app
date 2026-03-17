"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { confirmLeagueMatchAction, confirmLeagueMatchLairAction } from "@/app/leagues/actions";

type MatchPlayer = {
  id: string;
  username?: string;
  displayName?: string;
  discriminator?: string;
  avatar?: string;
};

type TemplateNotificationProps = {
  notification: any;
};

function formatPlayerName(player?: MatchPlayer | null) {
  if (!player) {
    return "Joueur inconnu";
  }

  if (player.displayName) {
    return player.discriminator
      ? `${player.displayName}#${player.discriminator}`
      : player.displayName;
  }

  return player.username || player.id;
}

export function NotificationTemplate({ notification }: TemplateNotificationProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const leagueId = notification.league?.id || notification.leagueId;
  const leagueName = notification.league?.name || "Ligue";
  const matchId = notification.match?.id || notification.matchId;
  const matchPlayers: MatchPlayer[] = notification.matchPlayers || [];
  const confirmedPlayerIds: string[] = notification.match?.confirmedPlayerIds || [];
  const recipientUserId: string | undefined = notification.userId;
  const winnerId = notification.match?.winnerIds?.[0];
  const winner = matchPlayers.find((player) => player.id === winnerId);
  const loser = winnerId
    ? matchPlayers.find((player) => player.id !== winnerId)
    : undefined;

  const isLairConfirmation = notification.template === "league-match-lair-confirmation-request";
  const canConfirm = !!leagueId && !!matchId;
  const isAlreadyConfirmed = isLairConfirmation
    ? !!notification.match?.lairConfirmedBy
    : notification.match?.status === "CONFIRMED" ||
      (recipientUserId
        ? confirmedPlayerIds.includes(recipientUserId)
        : !!notification.match?.confirmedBy);

  const handleConfirm = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canConfirm) {
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = isLairConfirmation
        ? await confirmLeagueMatchLairAction(leagueId, matchId)
        : await confirmLeagueMatchAction(leagueId, matchId);
      if (result.success) {
        setSuccess(isLairConfirmation ? "Lieu confirmé" : "Résultat confirmé");
      } else {
        setError(result.error || "Erreur lors de la confirmation");
      }
    });
  };

  return (
    <div className="space-y-2">
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
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Ligue :</span>
        {leagueId ? (
          <Link href={`/leagues/${leagueId}`} className="text-primary hover:underline">
            {leagueName}
          </Link>
        ) : (
          <span>{leagueName}</span>
        )}
      </div>
      {isLairConfirmation && (
        <div className="text-sm text-muted-foreground">
          Lieu : {notification.lair?.name || "Lieu non renseigné"}
        </div>
      )}
      <div className="text-sm text-muted-foreground">
        {matchPlayers.length >= 2 ? (
          <span>
            {formatPlayerName(matchPlayers[0])} vs {formatPlayerName(matchPlayers[1])}
          </span>
        ) : (
          <span>Match en cours de chargement</span>
        )}
      </div>
      {winner && loser ? (
        <div className="text-sm">
          <span className="font-medium">Vainqueur :</span> {formatPlayerName(winner)} · {" "}
          <span className="font-medium">Perdant :</span> {formatPlayerName(loser)}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          Résultat en attente de confirmation.
        </div>
      )}
      {notification.template !== 'league-match-assigned' && (
        <Button
            onClick={handleConfirm}
            disabled={isPending || !canConfirm || isAlreadyConfirmed}
            size="sm"
        >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isLairConfirmation ? "Valider le résultat" : "Confirmer le résultat"}
        </Button>
      )}
    </div>
  );
}
