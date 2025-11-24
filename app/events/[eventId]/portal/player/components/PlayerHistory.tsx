import { MatchResult } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type PlayerHistoryProps = {
  userId: string;
  matches: MatchResult[];
  participants: any[];
};

export default function PlayerHistory({ userId, matches, participants }: PlayerHistoryProps) {
  const myMatches = matches.filter(m => m.player1Id === userId || m.player2Id === userId);
  const pastMatches = myMatches.filter(m => m.status === "completed");

  const getPlayerName = (match: MatchResult, isPlayer1: boolean): string => {
    const playerId = isPlayer1 ? match.player1Id : match.player2Id;
    const playerName = isPlayer1 ? match.player1Name : match.player2Name;
    
    if (playerId === null) return "BYE";
    if (playerId === userId) return "Vous";
    if (playerName) return playerName;
    return `Joueur ${playerId.slice(-4)}`;
  };

  return (
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
                          {getPlayerName(match, true)} vs {getPlayerName(match, false)}
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
  );
}
