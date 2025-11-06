"use client";

import { Event } from "@/lib/types/Event";
import EventsCalendar from "@/app/events/EventsCalendar";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useTransition } from "react";
import { getUserLocation } from "@/lib/utils/geolocation";

type EventsCalendarClientProps = {
  initialEvents: Event[];
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
  
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [currentYear, setCurrentYear] = useState(initialYear);
  const [showAllGames, setShowAllGames] = useState(initialShowAllGames);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [maxDistance, setMaxDistance] = useState<number>(0); // 0 = pas de filtre
  const [isLocationLoading, setIsLocationLoading] = useState(false);

  // Fonction pour mettre à jour l'URL
  const updateURL = useCallback((month: number, year: number, allGames: boolean, distance?: number) => {
    const params = new URLSearchParams();
    params.set("month", month.toString());
    params.set("year", year.toString());
    params.set("allGames", allGames.toString());
    if (distance !== undefined && distance > 0) {
      params.set("maxDistance", distance.toString());
    }
    router.push(`${basePath}?${params.toString()}`, { scroll: false });
  }, [router, basePath]);

  // Fonction pour récupérer les événements
  const fetchEvents = useCallback(async (month: number, year: number, allGames: boolean, distance?: number) => {
    try {
      const params = new URLSearchParams({
        month: month.toString(),
        year: year.toString(),
        allGames: allGames.toString(),
        lairId: lairId ?? "",
      });

      // Add geolocation parameters if available
      if (userLocation && distance && distance > 0) {
        params.set("userLat", userLocation.latitude.toString());
        params.set("userLon", userLocation.longitude.toString());
        params.set("maxDistance", distance.toString());
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
  }, [userLocation, lairId]);

  // Gérer le changement de mois
  const handleMonthChange = useCallback((newMonth: number, newYear: number) => {
    // Simplement mettre à jour l'URL, le useEffect se chargera du fetch
    updateURL(newMonth, newYear, showAllGames, maxDistance);
  }, [showAllGames, maxDistance, updateURL]);

  // Gérer le changement du filtre de jeux
  const handleToggleAllGames = useCallback(() => {
    const newShowAllGames = !showAllGames;
    // Simplement mettre à jour l'URL, le useEffect se chargera du fetch
    updateURL(currentMonth, currentYear, newShowAllGames, maxDistance);
  }, [showAllGames, currentMonth, currentYear, maxDistance, updateURL]);

  // Gérer le changement de distance
  const handleDistanceChange = useCallback((distance: number) => {
    setMaxDistance(distance);
    updateURL(currentMonth, currentYear, showAllGames, distance);
  }, [currentMonth, currentYear, showAllGames, updateURL]);

  // Fonction pour demander la localisation de l'utilisateur
  const requestLocation = useCallback(async () => {
    setIsLocationLoading(true);
    const location = await getUserLocation();
    setUserLocation(location);
    setIsLocationLoading(false);
    
    if (location) {
      // Par défaut, utiliser un rayon de 50km
      handleDistanceChange(50);
    }
  }, [handleDistanceChange]);

  // Synchroniser avec les paramètres d'URL
  useEffect(() => {
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const allGamesParam = searchParams.get("allGames");
    const maxDistanceParam = searchParams.get("maxDistance");

    const month = monthParam ? parseInt(monthParam, 10) : initialMonth;
    const year = yearParam ? parseInt(yearParam, 10) : initialYear;
    const allGames = allGamesParam === "true";
    const distance = maxDistanceParam ? parseInt(maxDistanceParam, 10) : 0;

    if (
      month !== currentMonth ||
      year !== currentYear ||
      allGames !== showAllGames ||
      distance !== maxDistance
    ) {
      setCurrentMonth(month);
      setCurrentYear(year);
      setShowAllGames(allGames);
      setMaxDistance(distance);
      setEvents([]);
      fetchEvents(month, year, allGames, distance);
    }
  }, [searchParams, initialMonth, initialYear, currentMonth, currentYear, showAllGames, maxDistance, fetchEvents]);

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
          showViewToggle={true}
          currentMonth={currentMonth}
          currentYear={currentYear}
          showAllGames={showAllGames}
          onMonthChange={handleMonthChange}
          onToggleAllGames={handleToggleAllGames}
          userLocation={userLocation}
          maxDistance={maxDistance}
          onDistanceChange={handleDistanceChange}
          onRequestLocation={requestLocation}
          isLocationLoading={isLocationLoading}
        />
      </div>
    </div>
  );
}
