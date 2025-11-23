"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings, MatchResult, Announcement } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { 
  Trophy, 
  Clock,
  CheckCircle,
  Megaphone,
  AlertCircle,
  History
} from "lucide-react";
import {
  getMatchResults,
  reportMatchResult,
  confirmMatchResult,
  getAnnouncements,
  getPhaseStandings,
} from "./actions";
import { getEventParticipants } from "./participant-actions";

type PlayerPortalProps = {
  event: Event;
  settings: EventPortalSettings | null;
  userId: string;
};

export default function PlayerPortal({ event, settings, userId }: PlayerPortalProps) {
  const pathname = usePathname();
  
  // Déterminer l'onglet actif depuis l'URL
  const getActiveTab = (): "current" | "history" | "standings" | "announcements" => {
    if (pathname?.includes("/history")) return "history";
    if (pathname?.includes("/standings")) return "standings";
    if (pathname?.includes("/announcements")) return "announcements";
    return "current";
  };

  const activeTab = getActiveTab();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [announcementsLoaded, setAnnouncementsLoaded] = useState(false);
  const [standingsLoaded, setStandingsLoaded] = useState(false);
  const [participantsLoaded, setParticipantsLoaded] = useState(false);

  // Formulaire de rapport de résultat
  const [reportForm, setReportForm] = useState<{
    matchId: string;
    player1Score: number;
    player2Score: number;
  } | null>(null);

  // Charger les matchs
  const loadMatches = async () => {
    if (matchesLoaded) return;
    startTransition(async () => {
      const result = await getMatchResults(event.id);
      if (result.success && result.data) {
        setMatches(result.data as MatchResult[]);
        setMatchesLoaded(true);
      }
    });
  };

  // Charger les annonces
  const loadAnnouncements = async () => {
    if (announcementsLoaded) return;
    startTransition(async () => {
      const result = await getAnnouncements(event.id);
      if (result.success && result.data) {
        setAnnouncements(result.data as Announcement[]);
        setAnnouncementsLoaded(true);
      }
    });
  };

  // Charger les participants
  const loadParticipants = async () => {
    if (participantsLoaded) return;
    startTransition(async () => {
      const result = await getEventParticipants(event.id);
      if (result.success && result.data) {
        setParticipants(result.data);
        setParticipantsLoaded(true);
      }
    });
  };

  // Charger le classement
  const loadStandings = async () => {
    if (standingsLoaded || !settings?.currentPhaseId) return;
    startTransition(async () => {
      const phaseId = settings.currentPhaseId;
      if (!phaseId) return;
      const result = await getPhaseStandings(event.id, phaseId);
      if (result.success && result.data) {
        setStandings(result.data);
        setStandingsLoaded(true);
      }
    });
  };

  // Charger les données au montage
  useEffect(() => {
    loadMatches();
    loadAnnouncements();
    loadParticipants();
    // Charger les standings si c'est l'onglet initial
    if (activeTab === "standings") {
      loadStandings();
    }
  }, []);

  // Charger les standings quand on change d'onglet
  useEffect(() => {
    if (activeTab === "standings") {
      loadStandings();
    }
  }, [activeTab]);

  // Filtrer les matchs du joueur
  const myMatches = matches.filter(
    m => m.player1Id === userId || m.player2Id === userId
  );

  // Match actuel (le premier match en attente ou en cours)
  const currentMatch = myMatches.find(
    m => m.status === "pending" || m.status === "in-progress"
  );

  // Historique des matchs
  const pastMatches = myMatches.filter(m => m.status === "completed");

  // Calculer le classement (victoires/défaites)
  const wins = pastMatches.filter(m => m.winnerId === userId).length;
  const losses = pastMatches.filter(m => m.winnerId && m.winnerId !== userId).length;
  const draws = pastMatches.filter(m => !m.winnerId).length;

  // Rapporter un résultat
  const handleReportResult = (match: MatchResult) => {
    setReportForm({
      matchId: match.matchId,
      player1Score: match.player1Score || 0,
      player2Score: match.player2Score || 0,
    });
  };

  // Soumettre le rapport
  const handleSubmitReport = () => {
    if (!reportForm) return;

    startTransition(async () => {
      setError(null);
      const winnerId = reportForm.player1Score > reportForm.player2Score
        ? matches.find(m => m.matchId === reportForm.matchId)?.player1Id
        : reportForm.player2Score > reportForm.player1Score
          ? matches.find(m => m.matchId === reportForm.matchId)?.player2Id
          : undefined;

      const result = await reportMatchResult(event.id, {
        matchId: reportForm.matchId,
        player1Score: reportForm.player1Score,
        player2Score: reportForm.player2Score,
        winnerId,
      });

      if (result.success) {
        // Mise à jour optimiste
        setMatches(matches.map(m => 
          m.matchId === reportForm.matchId 
            ? {
                ...m,
                player1Score: reportForm.player1Score,
                player2Score: reportForm.player2Score,
                winnerId: winnerId || undefined,
                reportedBy: userId,
                status: 'in-progress' as const,
                updatedAt: new Date().toISOString(),
              }
            : m
        ));
        setSuccess("Résultat rapporté avec succès");
        setReportForm(null);
      } else {
        setError(result.error || "Erreur lors du rapport du résultat");
      }
    });
  };

  // Confirmer un résultat
  const handleConfirmResult = (matchId: string) => {
    startTransition(async () => {
      setError(null);
      const result = await confirmMatchResult(event.id, { matchId });

      if (result.success) {
        // Mise à jour optimiste
        setMatches(matches.map(m => 
          m.matchId === matchId
            ? {
                ...m,
                confirmedBy: userId,
                status: 'completed' as const,
                updatedAt: new Date().toISOString(),
              }
            : m
        ));
        setSuccess("Résultat confirmé avec succès");
      } else {
        setError(result.error || "Erreur lors de la confirmation du résultat");
      }
    });
  };

  // Obtenir le nom du joueur (simplifié, on affiche juste l&apos;ID)
  const getPlayerName = (playerId: string | null) => {
    if (playerId === null) return "BYE";
    if (playerId === userId) return "Vous";
    const participant = participants.find(p => p.id === playerId);
    if (!participant) return `Joueur ${playerId.slice(-4)}`;
    return participant.discriminator
      ? `${participant.username}#${participant.discriminator}`
      : participant.username;
  };

  // Obtenir la phase actuelle
  const currentPhase = settings?.phases.find(p => p.id === settings?.currentPhaseId);

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Portail Joueur</h1>
        <p className="text-muted-foreground">{event.name}</p>
        {currentPhase && (
          <p className="text-sm text-muted-foreground mt-1">
            Phase actuelle: {currentPhase.name} ({currentPhase.type === "swiss" ? "Rondes suisses" : "Élimination directe"})
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {!settings && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Le portail n&apos;a pas encore été configuré par l&apos;organisateur
          </AlertDescription>
        </Alert>
      )}

      {/* Navigation */}
      <div className="flex gap-2 mb-6 border-b">
        <Link href={`/events/${event.id}/portal/player`}>
          <Button
            variant={activeTab === "current" ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Clock className="h-4 w-4 mr-2" />
            Match actuel
          </Button>
        </Link>
        <Link href={`/events/${event.id}/portal/player/history`}>
          <Button
            variant={activeTab === "history" ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <History className="h-4 w-4 mr-2" />
            Historique
          </Button>
        </Link>
        <Link href={`/events/${event.id}/portal/player/standings`}>
          <Button
            variant={activeTab === "standings" ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Trophy className="h-4 w-4 mr-2" />
            Classement
          </Button>
        </Link>
        <Link href={`/events/${event.id}/portal/player/announcements`}>
          <Button
            variant={activeTab === "announcements" ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Megaphone className="h-4 w-4 mr-2" />
            Annonces
          </Button>
        </Link>
      </div>

      {/* Contenu des tabs */}
      {activeTab === "current" && (
        <div className="space-y-6">
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
                <CardTitle>Votre match actuel</CardTitle>
                <CardDescription>
                  {currentPhase && `${currentPhase.name} - ${currentPhase.matchType}`}
                  {currentMatch.round && ` - Ronde ${currentMatch.round}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-6">
                  <div className="text-2xl font-bold mb-4">
                    {getPlayerName(currentMatch.player1Id)} vs {getPlayerName(currentMatch.player2Id)}
                  </div>
                  <div className="text-4xl font-bold mb-4">
                    {currentMatch.player1Score || 0} - {currentMatch.player2Score || 0}
                  </div>
                  <Badge variant={
                    currentMatch.status === "in-progress" ? "secondary" : "outline"
                  }>
                    {currentMatch.status === "pending" ? "En attente" : "En cours"}
                  </Badge>
                </div>

                {settings?.allowSelfReporting && !reportForm && (
                  <div className="flex justify-center gap-2">
                    {currentMatch.status === "pending" && (
                      <Button onClick={() => handleReportResult(currentMatch)}>
                        Rapporter le résultat
                      </Button>
                    )}
                    {currentMatch.status === "in-progress" && 
                     currentMatch.reportedBy && 
                     currentMatch.reportedBy !== userId &&
                     settings?.requireConfirmation && (
                      <Button onClick={() => handleConfirmResult(currentMatch.matchId)}>
                        Confirmer le résultat
                      </Button>
                    )}
                  </div>
                )}

                {reportForm && reportForm.matchId === currentMatch.matchId && (
                  <div className="border rounded-lg p-4 space-y-4">
                    <h3 className="font-semibold">Rapporter le résultat</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">
                          Score {getPlayerName(currentMatch.player1Id)}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={reportForm.player1Score}
                          onChange={(e) => setReportForm({
                            ...reportForm,
                            player1Score: parseInt(e.target.value) || 0
                          })}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">
                          Score {getPlayerName(currentMatch.player2Id)}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={reportForm.player2Score}
                          onChange={(e) => setReportForm({
                            ...reportForm,
                            player2Score: parseInt(e.target.value) || 0
                          })}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSubmitReport} disabled={isPending}>
                        Soumettre
                      </Button>
                      <Button variant="outline" onClick={() => setReportForm(null)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}

                {currentMatch.status === "in-progress" && currentMatch.reportedBy && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {currentMatch.reportedBy === userId 
                        ? "Vous avez rapporté le résultat. En attente de confirmation de votre adversaire."
                        : "Votre adversaire a rapporté le résultat. Veuillez le confirmer."}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Historique de vos matchs</CardTitle>
              <CardDescription>
                Tous vos matchs terminés
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pastMatches.length === 0 ? (
                <p className="text-center text-muted-foreground">
                  Aucun match terminé pour le moment
                </p>
              ) : (
                <div className="space-y-2">
                  {pastMatches.map((match) => {
                    const isWinner = match.winnerId === userId;
                    const isDraw = !match.winnerId;
                    
                    return (
                      <div key={match.matchId} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium mb-1">
                              {getPlayerName(match.player1Id)} vs {getPlayerName(match.player2Id)}
                            </div>
                            <div className="text-2xl font-bold mb-2">
                              {match.player1Score} - {match.player2Score}
                            </div>
                            {match.round && (
                              <div className="text-xs text-muted-foreground">
                                Ronde {match.round}
                              </div>
                            )}
                          </div>
                          <Badge variant={
                            isWinner ? "default" : isDraw ? "secondary" : "destructive"
                          }>
                            {isWinner ? "Victoire" : isDraw ? "Égalité" : "Défaite"}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "standings" && (
        <div className="space-y-6">
          {/* Statistiques personnelles */}
          <Card>
            <CardHeader>
              <CardTitle>Vos statistiques</CardTitle>
              <CardDescription>
                Votre performance personnelle
              </CardDescription>
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
              <div className="mt-6 pt-6 border-t">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total de matchs</span>
                  <span className="text-2xl font-bold">{pastMatches.length}</span>
                </div>
                {pastMatches.length > 0 && (
                  <div className="flex justify-between items-center mt-2">
                    <span className="font-medium">Taux de victoire</span>
                    <span className="text-xl font-bold">
                      {Math.round((wins / pastMatches.length) * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Classement complet de la phase */}
          {currentPhase && (
            <Card>
              <CardHeader>
                <CardTitle>Classement - {currentPhase.name}</CardTitle>
                <CardDescription>
                  Classement actuel de la phase en cours
                </CardDescription>
              </CardHeader>
              <CardContent>
                {standings.length === 0 ? (
                  <p className="text-center text-muted-foreground">
                    Chargement du classement...
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr className="text-left">
                          <th className="p-2 font-medium">#</th>
                          <th className="p-2 font-medium">Joueur</th>
                          <th className="p-2 font-medium text-center">Points</th>
                          <th className="p-2 font-medium text-center">V-N-D</th>
                          <th className="p-2 font-medium text-center">GW-GL</th>
                          <th className="p-2 font-medium text-center">OMW%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((standing, index) => {
                          const isCurrentUser = standing.playerId === userId;
                          return (
                            <tr 
                              key={standing.playerId} 
                              className={`border-b ${isCurrentUser ? 'bg-blue-50' : ''}`}
                            >
                              <td className="p-2 font-medium">{index + 1}</td>
                              <td className="p-2">
                                {standing.username 
                                  ? `${standing.username}${standing.discriminator ? `#${standing.discriminator}` : ''}`
                                  : `Joueur ${standing.playerId.slice(-4)}`}
                                {isCurrentUser && (
                                  <Badge variant="outline" className="ml-2 text-xs">Vous</Badge>
                                )}
                              </td>
                              <td className="p-2 text-center font-bold">{standing.matchPoints}</td>
                              <td className="p-2 text-center">
                                <span className="text-green-600">{standing.wins}</span>-
                                <span className="text-gray-600">{standing.draws}</span>-
                                <span className="text-red-600">{standing.losses}</span>
                              </td>
                              <td className="p-2 text-center">
                                {standing.gamesWon}-{standing.gamesLost}
                              </td>
                              <td className="p-2 text-center">
                                {(standing.opponentMatchWinPercentage * 100).toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "announcements" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Annonces</CardTitle>
              <CardDescription>
                Messages de l&apos;organisateur
              </CardDescription>
            </CardHeader>
            <CardContent>
              {announcements.length === 0 ? (
                <p className="text-center text-muted-foreground">
                  Aucune annonce pour le moment
                </p>
              ) : (
                <div className="space-y-2">
                  {announcements.map((announcement) => (
                    <div key={announcement.id} className="border rounded-lg p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <Badge variant={
                          announcement.priority === "urgent" ? "destructive" : 
                          announcement.priority === "important" ? "secondary" : "outline"
                        }>
                          {announcement.priority === "urgent" ? "Urgent" : 
                           announcement.priority === "important" ? "Important" : "Normal"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(announcement.createdAt).toLocaleString("fr-FR")}
                        </span>
                      </div>
                      <p className="text-sm">{announcement.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
