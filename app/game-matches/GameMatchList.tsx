"use client";

import { GameMatch } from "@/lib/types/GameMatch";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTime } from "luxon";
import { Calendar, MapPin, Users, Eye, Trophy, Medal, Angry, Frown, Meh, Smile, Laugh } from "lucide-react";
import { useRouter } from "next/navigation";
import GameMatchActions from "./GameMatchActions";
import AddPlayerToMatch from "./AddPlayerToMatch";

type GameMatchListProps = {
  matches: GameMatch[];
  games: Game[];
  lairs: Lair[];
  currentUserId: string;
};

export default function GameMatchList({ matches, games, lairs, currentUserId }: GameMatchListProps) {
  const router = useRouter();

  if (matches.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Aucune partie enregistrée pour le moment</p>
      </div>
    );
  }

  const getGameName = (gameId: string) => {
    return games.find((g) => g.id === gameId)?.name || "Jeu inconnu";
  };

  const getLairName = (lairId?: string) => {
    if (!lairId) return null;
    return lairs.find((l) => l.id === lairId)?.name;
  };

  const getRatingIcon = (rating: number) => {
    const roundedRating = Math.round(rating);
    switch (roundedRating) {
      case 1:
        return <Angry className="h-4 w-4 text-red-500" />;
      case 2:
        return <Frown className="h-4 w-4 text-orange-500" />;
      case 3:
        return <Meh className="h-4 w-4 text-yellow-500" />;
      case 4:
        return <Smile className="h-4 w-4 text-green-500" />;
      case 5:
        return <Laugh className="h-4 w-4 text-emerald-500" />;
      default:
        return null;
    }
  };

  const getMVPPlayerIds = (match: GameMatch): string[] => {
    if (!match.mvpVotes || match.mvpVotes.length === 0) return [];
    
    const mvpCounts = match.players.reduce((acc, player) => {
      const votes = match.mvpVotes?.filter(v => v.votedForId === player.userId).length || 0;
      acc[player.userId] = votes;
      return acc;
    }, {} as Record<string, number>);
    
    const maxVotes = Math.max(...Object.values(mvpCounts), 0);
    return maxVotes > 0 
      ? Object.keys(mvpCounts).filter(playerId => mvpCounts[playerId] === maxVotes)
      : [];
  };

  return (
    <div className="space-y-4">
      {matches.map((match) => {
        const gameName = getGameName(match.gameId);
        const lairName = getLairName(match.lairId);
        const playedDate = DateTime.fromJSDate(match.playedAt).setZone('Europe/Paris');
        const isCreator = match.createdBy === currentUserId;
        const isPlayer = match.players.some((p) => p.userId === currentUserId);
        
        // Calculer la note moyenne
        const averageRating = match.ratings && match.ratings.length > 0
          ? match.ratings.reduce((sum, r) => sum + r.rating, 0) / match.ratings.length
          : undefined;
        
        // Obtenir les MVP
        const mvpPlayerIds = getMVPPlayerIds(match);

        return (
          <Card key={match.id} className="p-6 hover:shadow-md transition-shadow">
            <div className="space-y-4">
              {/* En-tête avec jeu et date */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold">{gameName}</h3>
                    {isCreator && (
                      <Badge variant="outline" className="text-xs">
                        Créateur
                      </Badge>
                    )}
                    {/* Note moyenne de la partie */}
                    {averageRating && (
                      <div className="flex items-center gap-1" title={`Note moyenne : ${averageRating.toFixed(1)}/5`}>
                        {getRatingIcon(averageRating)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {playedDate.toFormat("dd/MM/yyyy 'à' HH:mm")}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => router.push(`/game-matches/${match.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                    Détails
                  </Button>
                  {isPlayer && !isCreator && (
                    <GameMatchActions
                      matchId={match.id}
                      isCreator={false}
                      currentUserId={currentUserId}
                      variant="leave-match"
                    />
                  )}
                  {isCreator && (
                    <GameMatchActions
                      matchId={match.id}
                      isCreator={true}
                      currentUserId={currentUserId}
                      variant="delete-match"
                    />
                  )}
                </div>
              </div>

              {/* Lieu si présent */}
              {lairName && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{lairName}</span>
                </div>
              )}

              {/* Liste des joueurs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>Joueurs ({match.players.length})</span>
                  </div>
                  {isCreator && (
                    <AddPlayerToMatch matchId={match.id} />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {match.players.map((player, index) => {
                    const isMVP = mvpPlayerIds.includes(player.userId);
                    const isWinner = match.winners?.includes(player.userId);
                    
                    return (
                      <div key={index} className="flex items-center gap-1">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          {player.username}
                          {isMVP && (
                            <Medal className="h-3 w-3 text-yellow-500" />
                          )}
                          {isWinner && (
                            <Trophy className="h-3 w-3 text-amber-600" />
                          )}
                        </Badge>
                        {isCreator && (
                          <GameMatchActions
                            matchId={match.id}
                            isCreator={true}
                            currentUserId={currentUserId}
                            playerUserId={player.userId}
                            playerUsername={player.username}
                            variant="remove-player"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
