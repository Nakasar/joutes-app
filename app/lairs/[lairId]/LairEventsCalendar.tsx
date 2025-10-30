"use client";

import { Event } from "@/lib/types/Event";
import { Lair } from "@/lib/types/Lair";
import { Game } from "@/lib/types/Game";
import { useState, useMemo } from "react";
import EventsCalendar from "@/app/events/EventsCalendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Filter, Calendar } from "lucide-react";

type LairEventsCalendarProps = {
  events: Event[];
  lair: Lair;
  userGames: Game["id"][];
  games: Game[];
};

export default function LairEventsCalendar({
  events,
  lair,
  userGames,
  games,
}: LairEventsCalendarProps) {
  const [showAllGames, setShowAllGames] = useState(userGames.length === 0);

  // Créer une map des jeux pour accéder facilement au gameId par nom
  const gameNameToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    games.forEach((game) => {
      map.set(game.name, game.id);
    });
    return map;
  }, [games]);

  // Filtrer les événements selon les préférences
  const filteredEvents = useMemo(() => {
    if (showAllGames || userGames.length === 0) {
      return events;
    }

    return events.filter((event) => {
      const gameId = gameNameToIdMap.get(event.gameName);
      return gameId && userGames.includes(gameId);
    });
  }, [events, showAllGames, userGames, gameNameToIdMap]);

  // Créer une map avec le lair pour le composant EventsCalendar
  const lairsMap = useMemo(() => {
    const map = new Map<string, Lair>();
    map.set(lair.id, lair);
    return map;
  }, [lair]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Calendar className="h-8 w-8" />
              Événements à venir
            </CardTitle>
            <CardDescription>
              {filteredEvents.length === 0 && !showAllGames && userGames.length > 0
                ? "Aucun événement ne correspond à vos préférences de jeux"
                : showAllGames || userGames.length === 0
                  ? "Tous les événements prévus dans ce lieu"
                  : "Événements filtrés selon vos préférences de jeux"}
            </CardDescription>
          </div>

          {userGames.length > 0 && (
            <Button
              variant={showAllGames ? "outline" : "default"}
              onClick={() => setShowAllGames(!showAllGames)}
              className="w-full md:w-auto"
            >
              <Filter className="mr-2 h-4 w-4" />
              {showAllGames ? "Afficher mes jeux uniquement" : "Afficher tous les jeux"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg mb-4">
              {showAllGames || userGames.length === 0
                ? "Aucun événement à venir pour le moment"
                : "Aucun événement ne correspond à vos préférences de jeux"}
            </p>
            {!showAllGames && userGames.length > 0 && (
              <Button onClick={() => setShowAllGames(true)}>
                Afficher tous les événements
              </Button>
            )}
          </div>
        ) : (
          <EventsCalendar events={filteredEvents} lairsMap={lairsMap} />
        )}
      </CardContent>
    </Card>
  );
}
