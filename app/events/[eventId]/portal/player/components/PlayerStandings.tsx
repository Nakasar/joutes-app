"use client";

import { Event } from "@/lib/types/Event";
import { EventPortalSettings, MatchResult } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type PlayerStandingsProps = {
  event: Event;
  settings: EventPortalSettings | null | undefined;
  userId: string;
  matches: MatchResult[];
  standings: any[];
};

export default function PlayerStandings({ event, settings, userId, matches, standings }: PlayerStandingsProps) {
  const currentPhase = settings?.phases.find(p => p.id === settings?.currentPhaseId);
  const myMatches = matches.filter(m => m.player1Id === userId || m.player2Id === userId);
  const pastMatches = myMatches.filter(m => m.status === "completed");

  const wins = pastMatches.filter(m => m.winnerId === userId).length;
  const losses = pastMatches.filter(m => m.winnerId && m.winnerId !== userId).length;
  const draws = pastMatches.filter(m => !m.winnerId).length;

  return (
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

      {/* Classement complet */}
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
                          className={isCurrentUser ? "bg-primary/10 font-semibold" : ""}
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
  );
}
