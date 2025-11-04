"use client";

import { GameMatch } from "@/lib/types/GameMatch";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateTime } from "luxon";
import { Calendar, MapPin, Users } from "lucide-react";
import GameMatchActions from "./GameMatchActions";

type GameMatchListProps = {
  matches: GameMatch[];
  games: Game[];
  lairs: Lair[];
  currentUserId: string;
};

export default function GameMatchList({ matches, games, lairs, currentUserId }: GameMatchListProps) {
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

  return (
    <div className="space-y-4">
      {matches.map((match) => {
        const gameName = getGameName(match.gameId);
        const lairName = getLairName(match.lairId);
        const playedDate = DateTime.fromJSDate(match.playedAt).setZone('Europe/Paris');
        const isCreator = match.createdBy === currentUserId;
        const isPlayer = match.players.some((p) => p.userId === currentUserId);

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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>Joueurs ({match.players.length})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {match.players.map((player, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <Badge variant="secondary">
                        {player.username}
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
                  ))}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
