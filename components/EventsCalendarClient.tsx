"use client";

import { Event } from "@/lib/types/Event";
import EventsCalendar from "@/app/events/EventsCalendar";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useTransition } from "react";

type EventsCalendarClientProps = {
  initialEvents?: Event[];
  initialMonth: number;
  initialYear: number;
  initialShowAllGames: boolean;
  basePath: string;
  lairId?: string;
};

export default function EventsCalendarClient({
  initialEvents,
  initialMonth,
  initialYear,
  initialShowAllGames,
  basePath,
  lairId,
}: EventsCalendarClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [events, setEvents] = useState<Event[] | undefined>(initialEvents);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [currentYear, setCurrentYear] = useState(initialYear);
  const [showAllGames, setShowAllGames] = useState(initialShowAllGames);
  const [isLocationMode, setIsLocationMode] = useState(false);
  const [locationParams, setLocationParams] = useState<{ latitude: number; longitude: number; distance: number } | null>(null);

  // Fonction pour mettre à jour l'URL
  const updateURL = useCallback((
    month: number,
    year: number,
    allGames: boolean,
    locParams?: { latitude: number; longitude: number; distance: number } | null
  ) => {
    const params = new URLSearchParams();
    params.set("month", month.toString());
    params.set("year", year.toString());
    params.set("allGames", allGames.toString());
    
    if (locParams) {
      params.set("lat", locParams.latitude.toString());
      params.set("lon", locParams.longitude.toString());
      params.set("distance", locParams.distance.toString());
    }
    
    router.push(`${basePath}?${params.toString()}`, { scroll: false });
  }, [router, basePath]);

  // Fonction pour récupérer les événements
  const fetchEvents = useCallback(async (
    month: number,
    year: number,
    allGames: boolean,
    locParams?: { latitude: number; longitude: number; distance: number } | null
  ) => {
    try {
      const params = new URLSearchParams({
        month: month.toString(),
        year: year.toString(),
        allGames: allGames.toString(),
        lairId: lairId ?? "",
      });

      // Add geolocation parameters if available
      if (locParams) {
        params.set("userLat", locParams.latitude.toString());
        params.set("userLon", locParams.longitude.toString());
        params.set("maxDistance", locParams.distance.toString());
      }

      const response = await fetch(`/api/events?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error("Erreur lors de la récupération des événements");
      }

      const data = await response.json();
      startTransition(() => {
        setEvents(data.events);
      });
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  }, [lairId]);

  // Gérer le changement de mois
  const handleMonthChange = useCallback((newMonth: number, newYear: number) => {
    updateURL(newMonth, newYear, showAllGames, locationParams);
  }, [showAllGames, locationParams, updateURL]);

  // Gérer le changement du filtre de jeux
  const handleToggleAllGames = useCallback(() => {
    const newShowAllGames = !showAllGames;
    updateURL(currentMonth, currentYear, newShowAllGames, locationParams);
  }, [showAllGames, currentMonth, currentYear, locationParams, updateURL]);

  // Gérer la recherche par localisation
  const handleLocationSearch = useCallback((latitude: number, longitude: number, distance: number) => {
    const locParams = { latitude, longitude, distance };
    setLocationParams(locParams);
    setIsLocationMode(true);
    updateURL(currentMonth, currentYear, showAllGames, locParams);
  }, [currentMonth, currentYear, showAllGames, updateURL]);

  // Réinitialiser la recherche par localisation
  const handleResetLocation = useCallback(() => {
    console.log("Resetting location search");
    setLocationParams(null);
    setIsLocationMode(false);
    updateURL(currentMonth, currentYear, showAllGames, null);
  }, [currentMonth, currentYear, showAllGames, updateURL]);

  // Synchroniser avec les paramètres d'URL
  useEffect(() => {
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const allGamesParam = searchParams.get("allGames");
    const latParam = searchParams.get("lat");
    const lonParam = searchParams.get("lon");
    const distanceParam = searchParams.get("distance");

    const month = monthParam ? parseInt(monthParam, 10) : initialMonth;
    const year = yearParam ? parseInt(yearParam, 10) : initialYear;
    const allGames = allGamesParam === "true";
    
    let locParams: { latitude: number; longitude: number; distance: number } | null = null;
    if (latParam && lonParam && distanceParam) {
      locParams = {
        latitude: parseFloat(latParam),
        longitude: parseFloat(lonParam),
        distance: parseInt(distanceParam, 10),
      };
    }

    const hasLocationChanged = 
      (locParams === null && locationParams !== null) ||
      (locParams !== null && locationParams === null) ||
      (locParams !== null && locationParams !== null && (
        locParams.latitude !== locationParams.latitude ||
        locParams.longitude !== locationParams.longitude ||
        locParams.distance !== locationParams.distance
      ));

    if (
      month !== currentMonth ||
      year !== currentYear ||
      allGames !== showAllGames ||
      hasLocationChanged ||
      !events
    ) {
      setCurrentMonth(month);
      setCurrentYear(year);
      setShowAllGames(allGames);
      setLocationParams(locParams);
      setIsLocationMode(locParams !== null);
      
      setEvents([]);
      fetchEvents(month, year, allGames, locParams);
    }
  }, [searchParams, initialMonth, initialYear, currentMonth, currentYear, showAllGames, locationParams, fetchEvents, initialEvents?.length]);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="space-y-6">
        <EventsCalendar 
          events={events ?? []} 
          showViewToggle={true}
          currentMonth={currentMonth}
          currentYear={currentYear}
          showAllGames={showAllGames}
          onMonthChange={handleMonthChange}
          onToggleAllGames={handleToggleAllGames}
          onLocationSearch={handleLocationSearch}
          onResetLocation={handleResetLocation}
          isLocationMode={isLocationMode}
        />
      </div>
    </div>
  );
}
