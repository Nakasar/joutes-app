"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MatchResult } from "@/lib/schemas/event-portal.schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trophy, Save, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { getPlayerNote, updatePlayerNote, getMatchResults } from "../../actions";

type PlayerDetailsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  playerName: string;
  eventId: string;
  participants: any[];
};

export default function PlayerDetailsModal({
  open,
  onOpenChange,
  playerId,
  playerName,
  eventId,
  participants,
}: PlayerDetailsModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [originalNotes, setOriginalNotes] = useState("");
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Charger les notes et matchs au chargement
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      startTransition(async () => {
        try {
          // Charger les notes
          const notesResult = await getPlayerNote(eventId, playerId);
          if (notesResult.success) {
            setNotes(notesResult.data || "");
            setOriginalNotes(notesResult.data || "");
          }

          // Charger les matchs
          const matchesResult = await getMatchResults(eventId);
          if (matchesResult.success && matchesResult.data) {
            setMatches(matchesResult.data as MatchResult[]);
          }
        } catch (err) {
          console.error("Erreur lors du chargement des données:", err);
        } finally {
          setIsLoading(false);
        }
      });
    } else {
      // Reset lors de la fermeture
      setMatches([]);
      setNotes("");
      setOriginalNotes("");
      setError(null);
      setSuccess(null);
    }
  }, [open, eventId, playerId]);

  const playerMatches = matches.filter(
    (m) => m.player1Id === playerId || m.player2Id === playerId
  );

  const completedMatches = playerMatches.filter((m) => m.status === "completed");
  const wins = completedMatches.filter((m) => m.winnerId === playerId).length;
  const losses = completedMatches.filter(
    (m) => m.winnerId && m.winnerId !== playerId
  ).length;
  const draws = completedMatches.filter((m) => !m.winnerId).length;

  const getOpponentName = (match: MatchResult): string => {
    const opponentId =
      match.player1Id === playerId ? match.player2Id : match.player1Id;

    if (opponentId === null) return "BYE";

    const opponentName =
      match.player1Id === playerId ? match.player2Name : match.player1Name;

    if (opponentName) return opponentName;

    const participant = participants.find((p) => p.id === opponentId);
    if (participant) {
      return participant.discriminator
        ? `${participant.username}#${participant.discriminator}`
        : participant.username;
    }

    return `Joueur ${opponentId.slice(-4)}`;
  };

  const getMatchResult = (match: MatchResult): {
    result: "win" | "loss" | "draw";
    playerScore: number;
    opponentScore: number;
  } => {
    const isPlayer1 = match.player1Id === playerId;
    const playerScore = isPlayer1 ? match.player1Score : match.player2Score;
    const opponentScore = isPlayer1 ? match.player2Score : match.player1Score;

    let result: "win" | "loss" | "draw" = "draw";
    if (match.winnerId === playerId) result = "win";
    else if (match.winnerId && match.winnerId !== playerId) result = "loss";

    return { result, playerScore, opponentScore };
  };

  const handleSaveNotes = () => {
    startTransition(async () => {
      setError(null);
      setSuccess(null);

      const result = await updatePlayerNote(eventId, playerId, notes);

      if (result.success) {
        setSuccess("Notes sauvegardées");
        setOriginalNotes(notes);
        setTimeout(() => setSuccess(null), 3000);
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de la sauvegarde");
      }
    });
  };

  const hasUnsavedChanges = notes !== originalNotes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Détails du joueur</DialogTitle>
          <DialogDescription>{playerName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
          {/* Statistiques */}
          <Card>
            <CardHeader>
              <CardTitle>Statistiques</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-3xl font-bold text-green-600">{wins}</div>
                  <div className="text-sm text-muted-foreground">Victoires</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-gray-600">{draws}</div>
                  <div className="text-sm text-muted-foreground">Égalités</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-red-600">{losses}</div>
                  <div className="text-sm text-muted-foreground">Défaites</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Historique des matchs */}
          <Card>
            <CardHeader>
              <CardTitle>Historique des matchs</CardTitle>
              <CardDescription>
                {completedMatches.length} match{completedMatches.length > 1 ? "s" : ""}{" "}
                terminé{completedMatches.length > 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {completedMatches.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Aucun match terminé
                </p>
              ) : (
                <div className="space-y-2">
                  {completedMatches
                    .sort((a, b) => {
                      const aDate = new Date(a.createdAt || 0).getTime();
                      const bDate = new Date(b.createdAt || 0).getTime();
                      return bDate - aDate;
                    })
                    .map((match) => {
                      const { result, playerScore, opponentScore } =
                        getMatchResult(match);
                      const opponentName = getOpponentName(match);

                      return (
                        <div
                          key={match.matchId}
                          className={`border rounded-lg p-3 ${
                            result === "win"
                              ? "border-green-500 bg-green-50 dark:bg-green-900/10"
                              : result === "loss"
                              ? "border-red-500 bg-red-50 dark:bg-red-900/10"
                              : "border-gray-300 bg-gray-50 dark:bg-gray-900/10"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium">
                                vs {opponentName}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {match.round && `Ronde ${match.round}`}
                                {match.bracketPosition &&
                                  ` • Position: ${match.bracketPosition}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-2xl font-bold">
                                {playerScore} - {opponentScore}
                              </div>
                              <Badge
                                variant={
                                  result === "win"
                                    ? "default"
                                    : result === "loss"
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {result === "win" && (
                                  <>
                                    <Trophy className="h-3 w-3 mr-1" />
                                    Victoire
                                  </>
                                )}
                                {result === "loss" && "Défaite"}
                                {result === "draw" && "Égalité"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes de l'organisateur */}
          <Card>
            <CardHeader>
              <CardTitle>Notes de l&apos;organisateur</CardTitle>
              <CardDescription>
                Notes privées visibles uniquement par vous
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-green-500 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    {success}
                  </AlertDescription>
                </Alert>
              )}

              <Textarea
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                placeholder="Ajoutez des notes sur ce joueur..."
                className="min-h-[150px]"
                disabled={isPending}
              />

              <div className="flex justify-end gap-2">
                {hasUnsavedChanges && (
                  <span className="text-sm text-muted-foreground self-center">
                    Modifications non sauvegardées
                  </span>
                )}
                <Button
                  onClick={handleSaveNotes}
                  disabled={isPending || !hasUnsavedChanges}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Sauvegarder
                </Button>
              </div>
            </CardContent>
          </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
