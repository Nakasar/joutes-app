"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings, MatchResult } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { CheckCircle, AlertCircle } from "lucide-react";
import { reportMatchResult, confirmMatchResult } from "../../actions";

type PlayerCurrentMatchProps = {
  event: Event;
  settings: EventPortalSettings | null | undefined;
  userId: string;
  matches: MatchResult[];
  participants: any[];
};

export default function PlayerCurrentMatch({ 
  event, 
  settings, 
  userId, 
  matches, 
  participants
}: PlayerCurrentMatchProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reportForm, setReportForm] = useState<{
    matchId: string;
    player1Score: number;
    player2Score: number;
  } | null>(null);

  const currentPhase = settings?.phases.find(p => p.id === settings?.currentPhaseId);
  const myMatches = matches.filter(m => m.player1Id === userId || m.player2Id === userId);

  // Match actuel
  let currentMatch = myMatches.find(m => m.status === "pending" || m.status === "in-progress");

  if (!currentMatch && currentPhase) {
    const currentPhaseMatches = myMatches.filter(m => m.phaseId === currentPhase.id);
    
    if (currentPhaseMatches.length > 0) {
      if (currentPhase.type === "swiss") {
        const maxRound = Math.max(...currentPhaseMatches.map(m => m.round || 0));
        currentMatch = currentPhaseMatches.find(m => m.round === maxRound);
      } else {
        currentMatch = currentPhaseMatches.sort((a, b) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        )[0];
      }
    }
  }

  const getPlayerName = (match: MatchResult, isPlayer1: boolean): string => {
    const playerId = isPlayer1 ? match.player1Id : match.player2Id;
    const playerName = isPlayer1 ? match.player1Name : match.player2Name;
    
    if (playerId === null) return "BYE";
    if (playerId === userId) return "Vous";
    if (playerName) return playerName;
    return `Joueur ${playerId.slice(-4)}`;
  };

  const handleReportResult = (match: MatchResult) => {
    setReportForm({
      matchId: match.matchId,
      player1Score: match.player1Score || 0,
      player2Score: match.player2Score || 0,
    });
  };

  const handleSubmitReport = () => {
    if (!reportForm) return;

    startTransition(async () => {
      setError(null);
      const result = await reportMatchResult(event.id, reportForm);

      if (result.success) {
        setSuccess("Résultat rapporté avec succès");
        setReportForm(null);
        router.refresh();
      } else {
        setError(result.error || "Erreur lors du rapport");
      }
    });
  };

  const handleConfirmResult = (matchId: string) => {
    startTransition(async () => {
      setError(null);
      const result = await confirmMatchResult(event.id, { matchId });

      if (result.success) {
        setSuccess("Résultat confirmé");
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de la confirmation");
      }
    });
  };

  return (
    <div className="space-y-6">
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

      {!currentMatch ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Aucun match en cours pour le moment
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {currentMatch.status === "completed" ? "Votre dernier match" : "Votre match actuel"}
            </CardTitle>
            <CardDescription>
              {currentPhase && `${currentPhase.name} - ${currentPhase.matchType}`}
              {currentMatch.round && ` - Ronde ${currentMatch.round}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-6">
              <div className="text-2xl font-bold mb-4">
                {getPlayerName(currentMatch, true)} vs {getPlayerName(currentMatch, false)}
              </div>
              <div className="text-4xl font-bold mb-4">
                {currentMatch.player1Score || 0} - {currentMatch.player2Score || 0}
              </div>
              <Badge variant={
                currentMatch.status === "completed" 
                  ? (currentMatch.winnerId === userId ? "default" : currentMatch.winnerId ? "destructive" : "secondary")
                  : currentMatch.status === "in-progress" 
                    ? "secondary" 
                    : "outline"
              }>
                {currentMatch.status === "pending" && "En attente"}
                {currentMatch.status === "in-progress" && "En cours"}
                {currentMatch.status === "completed" && (
                  currentMatch.winnerId === userId ? "Victoire" : 
                  currentMatch.winnerId ? "Défaite" : "Égalité"
                )}
              </Badge>
            </div>

            {settings?.allowSelfReporting && currentMatch.status !== "completed" && (
              <div className="space-y-4">
                {!reportForm ? (
                  <Button onClick={() => handleReportResult(currentMatch)} className="w-full">
                    Rapporter le résultat
                  </Button>
                ) : (
                  <div className="border rounded-lg p-4 space-y-4">
                    <h4 className="font-medium">Rapporter le résultat</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm">Score {getPlayerName(currentMatch, true)}</label>
                        <Input
                          type="number"
                          min="0"
                          value={reportForm.player1Score}
                          onChange={(e) => setReportForm({ ...reportForm, player1Score: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label className="text-sm">Score {getPlayerName(currentMatch, false)}</label>
                        <Input
                          type="number"
                          min="0"
                          value={reportForm.player2Score}
                          onChange={(e) => setReportForm({ ...reportForm, player2Score: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSubmitReport} disabled={isPending} className="flex-1">
                        Envoyer
                      </Button>
                      <Button variant="outline" onClick={() => setReportForm(null)} className="flex-1">
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {settings?.requireConfirmation && currentMatch.status === "in-progress" && 
             currentMatch.reportedBy && currentMatch.reportedBy !== userId && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>Votre adversaire a rapporté un résultat. Confirmez-vous ?</span>
                  <Button size="sm" onClick={() => handleConfirmResult(currentMatch.matchId)}>
                    Confirmer
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
