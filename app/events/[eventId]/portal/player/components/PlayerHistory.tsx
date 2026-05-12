import { MatchResult } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type EventParticipant = {
  id: string;
  username?: string;
  discriminator?: string;
  email?: string;
  profileImage?: string;
  type: string;
  registrationStatus: string;
};

type PlayerHistoryProps = {
  userId: string;
  matches: MatchResult[];
  participants: EventParticipant[];
};

export default function PlayerHistory({ userId, matches, participants }: PlayerHistoryProps) {
  const myMatches = matches.filter(m => m.players.some(p => p.id === userId));
  const pastMatches = myMatches.filter(m => m.status === "completed");

  const getPlayerName = (match: MatchResult, playerId: string | null): string => {
    if (playerId === null) return "BYE";
    if (playerId === userId) return "Vous";
    const playerEntry = match.players.find(p => p.id === playerId);
    if (playerEntry?.name) return playerEntry.name;
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
                          {match.players.map(p => getPlayerName(match, p.id)).join(" vs ")}
                        </div>
                        <div className="text-2xl font-bold mb-2">
                          {match.players.filter(p => p.id !== null).map(p => p.score).join(" - ")}
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
