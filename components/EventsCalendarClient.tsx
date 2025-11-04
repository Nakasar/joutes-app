"use client";

import { Event } from "@/lib/types/Event";
import { Lair } from "@/lib/types/Lair";
import { Game } from "@/lib/types/Game";
import EventsCalendar from "@/app/events/EventsCalendar";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { DateTime } from "luxon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Gamepad2, Loader2 } from "lucide-react";
import Link from "next/link";

type EventsCalendarClientProps = {
  initialEvents: Event[];
  initialLairsMap: Record<string, Lair>;
  initialMonth: number;
  initialYear: number;
  initialShowAllGames: boolean;
  userGames: Game["id"][];
  allGames: Game[];
  basePath: string;
};

export default function EventsCalendarClient({
  initialEvents,
  initialLairsMap,
  initialMonth,
  initialYear,
  initialShowAllGames,
  userGames,
  allGames,
  basePath,
}: EventsCalendarClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [lairsMap, setLairsMap] = useState<Map<string, Lair>>(
    new Map(Object.entries(initialLairsMap))
  );
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [currentYear, setCurrentYear] = useState(initialYear);
  const [showAllGames, setShowAllGames] = useState(initialShowAllGames);
  const [isLoading, setIsLoading] = useState(false);

  // Fonction pour mettre à jour l'URL
  const updateURL = useCallback((month: number, year: number, allGames: boolean) => {
    const params = new URLSearchParams();
    params.set("month", month.toString());
    params.set("year", year.toString());
    params.set("allGames", allGames.toString());
    router.push(`${basePath}?${params.toString()}`, { scroll: false });
  }, [router, basePath]);

  // Fonction pour récupérer les événements
  const fetchEvents = useCallback(async (month: number, year: number, allGames: boolean) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        month: month.toString(),
        year: year.toString(),
        allGames: allGames.toString(),
      });

      const response = await fetch(`/api/events?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error("Erreur lors de la récupération des événements");
      }

      const data = await response.json();
      setEvents(data.events);
      setLairsMap(new Map(Object.entries(data.lairsMap)));
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Gérer le changement de mois
  const handleMonthChange = useCallback((newMonth: number, newYear: number) => {
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
    updateURL(newMonth, newYear, showAllGames);
    fetchEvents(newMonth, newYear, showAllGames);
  }, [showAllGames, updateURL, fetchEvents]);

  // Gérer le changement du filtre de jeux
  const handleToggleAllGames = useCallback(() => {
    const newShowAllGames = !showAllGames;
    setShowAllGames(newShowAllGames);
    updateURL(currentMonth, currentYear, newShowAllGames);
    fetchEvents(currentMonth, currentYear, newShowAllGames);
  }, [showAllGames, currentMonth, currentYear, updateURL, fetchEvents]);

  // Synchroniser avec les paramètres d'URL
  useEffect(() => {
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const allGamesParam = searchParams.get("allGames");

    const month = monthParam ? parseInt(monthParam, 10) : initialMonth;
    const year = yearParam ? parseInt(yearParam, 10) : initialYear;
    const allGames = allGamesParam === "true";

    if (
      month !== currentMonth ||
      year !== currentYear ||
      allGames !== showAllGames
    ) {
      setCurrentMonth(month);
      setCurrentYear(year);
      setShowAllGames(allGames);
      fetchEvents(month, year, allGames);
    }
  }, [searchParams, initialMonth, initialYear, currentMonth, currentYear, showAllGames, fetchEvents]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Chargement des événements...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">
                Calendrier des Événements
              </h1>
            </div>
          </div>
          
          <Card>
            <CardHeader className="text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <CardTitle>Aucun événement prévu</CardTitle>
              <CardDescription>
                {showAllGames 
                  ? "Aucun événement n&apos;est prévu dans les lieux que vous suivez pour ce mois."
                  : "Aucun événement n&apos;est prévu dans les lieux que vous suivez pour les jeux qui vous intéressent ce mois."
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4 justify-center flex-wrap pb-6">
              {!showAllGames && (
                <Button variant="outline" onClick={handleToggleAllGames}>
                  <Gamepad2 className="mr-2 h-4 w-4" />
                  Voir tous les jeux
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/lairs">
                  <MapPin className="mr-2 h-4 w-4" />
                  Gérer mes lieux
                </Link>
              </Button>
              {!showAllGames && (
                <Button variant="outline" asChild>
                  <Link href="/account">
                    <Gamepad2 className="mr-2 h-4 w-4" />
                    Gérer mes jeux
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              Calendrier des Événements
            </h1>
          </div>
        </div>
        
        <EventsCalendar 
          events={events} 
          lairsMap={lairsMap} 
          userGames={userGames}
          allGames={allGames}
          showViewToggle={true}
          currentMonth={currentMonth}
          currentYear={currentYear}
          showAllGames={showAllGames}
          onMonthChange={handleMonthChange}
          onToggleAllGames={handleToggleAllGames}
        />
      </div>
    </div>
  );
}
