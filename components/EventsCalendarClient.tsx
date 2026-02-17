"use client";

import { Event } from "@/lib/types/Event";
import { Game } from "@/lib/types/Game";
import EventsCalendar from "@/app/events/EventsCalendar";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useTransition, useRef } from "react";

type EventsCalendarClientProps = {
  initialEvents?: Event[];
  initialMonth: number;
  initialYear: number;
  initialGameId: string;
  availableGames?: Game[];
  basePath: string;
  lairId?: string;
  userLocation?: {
    latitude: number;
    longitude: number;
  };
};

type LocationParams = {
  latitude: number;
  longitude: number;
  distance: number;
} | null;

export default function EventsCalendarClient({
  initialEvents,
  initialMonth,
  initialYear,
  initialGameId,
  availableGames = [],
  basePath,
  lairId,
  userLocation,
}: EventsCalendarClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  
  const [events, setEvents] = useState<Event[]>(initialEvents ?? []);
  const [isLoading, setIsLoading] = useState(false);
  
  // Utiliser useRef pour éviter les re-renders inutiles et les boucles infinies
  const lastFetchParamsRef = useRef<string>("");

  // Parser les paramètres d'URL une seule fois
  const urlParams = useCallback(() => {
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const gameIdParam = searchParams.get("gameId");
    const latParam = searchParams.get("lat");
    const lonParam = searchParams.get("lon");
    const distanceParam = searchParams.get("distance");

    const month = monthParam ? parseInt(monthParam, 10) : initialMonth;
    const year = yearParam ? parseInt(yearParam, 10) : initialYear;
    const gameId = gameIdParam || initialGameId;
    
    let locParams: LocationParams = null;
    if (latParam && lonParam && distanceParam) {
      locParams = {
        latitude: parseFloat(latParam),
        longitude: parseFloat(lonParam),
        distance: parseInt(distanceParam, 10),
      };
    }

    return { month, year, gameId, locParams };
  }, [searchParams, initialMonth, initialYear, initialGameId]);

  const params = urlParams();
  const isLocationMode = params.locParams !== null;

  // Fonction pour récupérer les événements
  const fetchEvents = useCallback(async (
    month: number,
    year: number,
    gameId: string,
    locParams: LocationParams
  ) => {
    const fetchParamsKey = JSON.stringify({ month, year, gameId, locParams, lairId });
    
    // Éviter les fetches en double
    if (lastFetchParamsRef.current === fetchParamsKey) {
      return;
    }
    
    lastFetchParamsRef.current = fetchParamsKey;
    setIsLoading(true);

    try {
      const apiParams = new URLSearchParams({
        month: month.toString(),
        year: year.toString(),
        gameId: gameId,
        lairId: lairId ?? "",
      });

      if (locParams) {
        apiParams.set("userLat", locParams.latitude.toString());
        apiParams.set("userLon", locParams.longitude.toString());
        apiParams.set("maxDistance", locParams.distance.toString());
      }

      const response = await fetch(`/api/events?${apiParams.toString()}`);
      
      if (!response.ok) {
        throw new Error("Erreur lors de la récupération des événements");
      }

      const data = await response.json();
      startTransition(() => {
        setEvents(data.events);
        setIsLoading(false);
      });
    } catch (error) {
      console.error("Error fetching events:", error);
      setIsLoading(false);
    }
  }, [lairId]);

  // Fonction pour mettre à jour l'URL (la source de vérité)
  const updateURL = useCallback((
    month: number,
    year: number,
    gameId: string,
    locParams: LocationParams
  ) => {
    const newParams = new URLSearchParams();
    newParams.set("month", month.toString());
    newParams.set("year", year.toString());
    newParams.set("gameId", gameId);
    
    if (locParams) {
      newParams.set("lat", locParams.latitude.toString());
      newParams.set("lon", locParams.longitude.toString());
      newParams.set("distance", locParams.distance.toString());
    }
    
    router.push(`${basePath}?${newParams.toString()}`, { scroll: false });
  }, [router, basePath]);

  // Gérer le changement de mois
  const handleMonthChange = useCallback((newMonth: number, newYear: number) => {
    updateURL(newMonth, newYear, params.gameId, params.locParams);
  }, [params.gameId, params.locParams, updateURL]);

  // Gérer le changement du filtre de jeux
  const handleGameIdChange = useCallback((newGameId: string) => {
    updateURL(params.month, params.year, newGameId, params.locParams);
  }, [params.month, params.year, params.locParams, updateURL]);

  // Gérer la recherche par localisation
  const handleLocationSearch = useCallback((latitude: number, longitude: number, distance: number) => {
    const locParams = { latitude, longitude, distance };
    updateURL(params.month, params.year, params.gameId, locParams);
  }, [params.month, params.year, params.gameId, updateURL]);

  // Réinitialiser la recherche par localisation
  const handleResetLocation = useCallback(() => {
    updateURL(params.month, params.year, params.gameId, null);
  }, [params.month, params.year, params.gameId, updateURL]);

  // Effet pour synchroniser avec l'URL (source de vérité unique)
  useEffect(() => {
    fetchEvents(params.month, params.year, params.gameId, params.locParams);
  }, [params.month, params.year, params.gameId, params.locParams, fetchEvents]);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="space-y-6">
        <EventsCalendar 
          events={events}
          showViewToggle={true}
          currentMonth={params.month}
          currentYear={params.year}
          gameId={params.gameId}
          availableGames={availableGames}
          onMonthChange={handleMonthChange}
          onGameIdChange={handleGameIdChange}
          onLocationSearch={handleLocationSearch}
          onResetLocation={handleResetLocation}
          isLocationMode={isLocationMode}
          userLocation={userLocation}
        />
      </div>
    </div>
  );
}
