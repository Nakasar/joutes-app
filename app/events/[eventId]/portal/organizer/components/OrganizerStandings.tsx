"use client";

import { useState } from "react";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings, MatchResult } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import PlayerDetailsModal from "./PlayerDetailsModal";

type OrganizerStandingsProps = {
  event: Event;
  settings: EventPortalSettings;
  standings: any[];
  participants: any[];
  matches: MatchResult[];
};

export default function OrganizerStandings({ event, settings, standings, participants, matches }: OrganizerStandingsProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<{
    playerId: string;
    playerName: string;
  } | null>(null);

  const currentPhase = settings.phases.find(p => p.id === settings.currentPhaseId);

  const getParticipantName = (playerId: string): string => {
    const participant = participants.find(p => p.id === playerId);
    if (!participant) return `Joueur ${playerId.slice(-4)}`;
    
    return participant.discriminator 
      ? `${participant.username}#${participant.discriminator}`
      : participant.username;
  };

  if (!currentPhase) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Aucune phase active
          </p>
        </CardContent>
      </Card>
    );
  }

  if (standings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Classement - {currentPhase.name}</CardTitle>
          <CardDescription>
            {currentPhase.type === "swiss" ? "Rondes suisses" : "Élimination directe"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            Aucun classement disponible pour le moment
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Classement - {currentPhase.name}</CardTitle>
          <CardDescription>
            {currentPhase.type === "swiss" ? "Rondes suisses" : "Élimination directe"} • {standings.length} participants
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {standings.map((standing, index) => {
              const totalGames = standing.wins + standing.losses + standing.draws;
              const winRate = totalGames > 0 ? ((standing.wins / totalGames) * 100).toFixed(0) : 0;

              return (
                <div 
                  key={standing.playerId} 
                  className={`border rounded-lg p-4 ${
                    index === 0 ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10" :
                    index === 1 ? "border-gray-400 bg-gray-50 dark:bg-gray-900/10" :
                    index === 2 ? "border-orange-600 bg-orange-50 dark:bg-orange-900/10" :
                    ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-bold w-8 text-center">
                        #{index + 1}
                      </div>
                      <div>
                        <div className="font-medium">
                          {getParticipantName(standing.playerId)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {standing.wins}V - {standing.draws}N - {standing.losses}D
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">Points</div>
                        <div className="text-2xl font-bold">{standing.matchPoints}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">Diff</div>
                        <div className={`text-lg font-bold ${
                          standing.gamesDiff > 0 ? "text-green-600" :
                          standing.gamesDiff < 0 ? "text-red-600" :
                          "text-gray-600"
                        }`}>
                          {standing.gamesDiff > 0 ? "+" : ""}{standing.gamesDiff}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">WR</div>
                        <Badge variant={
                          Number(winRate) >= 75 ? "default" :
                          Number(winRate) >= 50 ? "secondary" :
                          "outline"
                        }>
                          {winRate}%
                        </Badge>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSelectedPlayer({
                            playerId: standing.playerId,
                            playerName: getParticipantName(standing.playerId),
                          })
                        }
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Détails
                      </Button>
                    </div>
                  </div>
                  
                  {/* Détails supplémentaires */}
                  <div className="mt-2 pt-2 border-t text-xs text-muted-foreground flex gap-4">
                    <span>Parties gagnées: {standing.gamesWon}</span>
                    <span>Parties perdues: {standing.gamesLost}</span>
                    {standing.opponentMatchWinPercentage !== undefined && (
                      <span>OMW%: {(standing.opponentMatchWinPercentage * 100).toFixed(1)}%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Statistiques globales */}
      <Card>
        <CardHeader>
          <CardTitle>Statistiques globales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {standings.reduce((sum, s) => sum + s.wins, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Victoires totales</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {standings.reduce((sum, s) => sum + s.draws, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Égalités totales</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {standings.reduce((sum, s) => sum + s.losses, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Défaites totales</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {standings.reduce((sum, s) => sum + s.gamesWon + s.gamesLost, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Parties jouées</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal des détails du joueur */}
      {selectedPlayer && (
        <PlayerDetailsModal
          open={!!selectedPlayer}
          onOpenChange={(open) => !open && setSelectedPlayer(null)}
          playerId={selectedPlayer.playerId}
          playerName={selectedPlayer.playerName}
          eventId={event.id}
          matches={matches}
          participants={participants}
        />
      )}
    </div>
  );
}
