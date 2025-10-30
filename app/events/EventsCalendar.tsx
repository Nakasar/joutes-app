"use client";

import { Event } from "@/lib/types/Event";
import { Lair } from "@/lib/types/Lair";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Gamepad2, Euro } from "lucide-react";
import Link from "next/link";
import { DateTime } from "luxon";

type EventsCalendarProps = {
  events: Event[];
  lairsMap: Map<string, Lair>;
};

export default function EventsCalendar({ events, lairsMap }: EventsCalendarProps) {
  const today = DateTime.now();
  const [currentMonth, setCurrentMonth] = useState<number>(today.month);
  const [currentYear, setCurrentYear] = useState<number>(today.year);

  // Navigation entre les mois
  const goToPreviousMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToCurrentMonth = () => {
    setCurrentMonth(today.month);
    setCurrentYear(today.year);
  };

  // Obtenir le nombre de jours dans le mois
  const getDaysInMonth = (month: number, year: number) => {
    return DateTime.local(year, month, 1).daysInMonth || 31;
  };

  // Obtenir le premier jour de la semaine du mois (0 = lundi, 6 = dimanche)
  const getFirstDayOfMonth = (month: number, year: number) => {
    const firstDay = DateTime.local(year, month, 1).weekday;
    // weekday dans Luxon: 1 = lundi, 7 = dimanche
    // Convertir pour que lundi soit 0 et dimanche soit 6
    return firstDay - 1;
  };

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDayOfWeek = getFirstDayOfMonth(currentMonth, currentYear);

  // Filtrer les événements pour le mois actuel
  const eventsInMonth = useMemo(() => {
    return events.filter((event) => {
      const eventDate = DateTime.fromISO(event.startDateTime);
      return (
        eventDate.month === currentMonth &&
        eventDate.year === currentYear
      );
    }).sort((a, b) => {
      // Trier par date de début
      const dateA = DateTime.fromISO(a.startDateTime);
      const dateB = DateTime.fromISO(b.startDateTime);
      return dateA.toMillis() - dateB.toMillis();
    });
  }, [events, currentMonth, currentYear]);

  // Organiser les événements par jour
  const eventsByDay = new Map<number, Event[]>();
  eventsInMonth.forEach((event) => {
    const day = DateTime.fromISO(event.startDateTime).day;
    if (!eventsByDay.has(day)) {
      eventsByDay.set(day, []);
    }
    eventsByDay.get(day)?.push(event);
  });

  // Grouper les événements par jour pour la vue liste (mobile)
  const eventsByDayForList = useMemo(() => {
    const grouped = new Map<string, Event[]>();
    eventsInMonth.forEach((event) => {
      const eventDate = DateTime.fromISO(event.startDateTime);
      const dayKey = eventDate.setLocale('fr').toLocaleString({
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      if (!grouped.has(dayKey)) {
        grouped.set(dayKey, []);
      }
      grouped.get(dayKey)?.push(event);
    });
    return grouped;
  }, [eventsInMonth]);

  // Noms des mois en français
  const monthNames = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];

  // Noms des jours de la semaine
  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  // Générer les jours du calendrier (avec les cases vides au début)
  const calendarDays = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const isToday = (day: number | null) => {
    if (day === null) return false;
    return (
      day === today.day &&
      currentMonth === today.month &&
      currentYear === today.year
    );
  };

  const getStatusVariant = (status: Event["status"]): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "available":
        return "default";
      case "sold-out":
        return "destructive";
      case "cancelled":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getStatusLabel = (status: Event["status"]) => {
    switch (status) {
      case "available":
        return "Disponible";
      case "sold-out":
        return "Complet";
      case "cancelled":
        return "Annulé";
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête avec navigation */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Button
              onClick={goToPreviousMonth}
              className="w-full sm:w-auto"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Mois précédent
            </Button>

            <div className="text-center">
              <CardTitle className="text-2xl">
                {monthNames[currentMonth - 1]} {currentYear}
              </CardTitle>
              {(currentMonth !== today.month ||
                currentYear !== today.year) && (
                  <Button
                    onClick={goToCurrentMonth}
                    className="mt-2 text-sm"
                  >
                    Revenir au mois actuel
                  </Button>
                )}
            </div>

            <Button
              onClick={goToNextMonth}
              className="w-full sm:w-auto"
            >
              Mois suivant
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Vue calendrier (cachée sur mobile) */}
      <div className="hidden lg:block">
        <Card>
          <CardContent className="p-4">
            {/* En-têtes des jours de la semaine */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {dayNames.map((dayName) => (
                <div
                  key={dayName}
                  className="text-center font-semibold text-muted-foreground py-2"
                >
                  {dayName}
                </div>
              ))}
            </div>

            {/* Jours du calendrier */}
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day, index) => (
                <div
                  key={index}
                  className={`min-h-[120px] border rounded-lg p-2 ${day === null
                    ? "bg-muted/30"
                    : isToday(day)
                      ? "bg-primary/10 border-primary"
                      : "bg-card"
                    }`}
                >
                  {day !== null && (
                    <>
                      <div
                        className={`text-sm font-semibold mb-1 ${isToday(day)
                          ? "text-primary"
                          : "text-foreground"
                          }`}
                      >
                        {day}
                      </div>
                      <div className="space-y-1">
                        {eventsByDay.get(day)?.map((event) => {
                          const lair = lairsMap.get(event.lairId);
                          const startTime = DateTime.fromISO(
                            event.startDateTime
                          ).toLocaleString(DateTime.TIME_24_SIMPLE);
                          
                          const eventContent = (
                            <div className="text-xs p-2 rounded-md bg-background border hover:bg-accent hover:border-accent-foreground transition-colors cursor-pointer">
                              <div className="font-semibold truncate mb-1" title={event.name}>
                                {event.name}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                <CalendarIcon className="h-3 w-3" />
                                {startTime}
                              </div>
                              <div className="text-xs text-muted-foreground truncate flex items-center gap-1" title={lair?.name}>
                                <MapPin className="h-3 w-3" />
                                {lair?.name || "Lieu inconnu"}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                <Gamepad2 className="h-3 w-3" />
                                {event.gameName}
                              </div>
                              <div className="flex items-center gap-1">
                                <Badge variant={getStatusVariant(event.status)} className="text-xs">
                                  {getStatusLabel(event.status)}
                                </Badge>
                                {event.price && (
                                  <span className="text-xs font-semibold flex items-center">
                                    <Euro className="h-3 w-3" />
                                    {event.price}
                                  </span>
                                )}
                              </div>
                            </div>
                          );

                          return event.url ? (
                            <Link
                              key={event.id}
                              href={event.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {eventContent}
                            </Link>
                          ) : (
                            <div key={event.id}>
                              {eventContent}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Légende */}
        <div className="flex flex-wrap gap-4 justify-center mt-4">
          <div className="flex items-center gap-2">
            <Badge variant="default">Disponible</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive">Complet</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Annulé</Badge>
          </div>
        </div>
      </div>

      {/* Vue liste (visible sur mobile et tablette) */}
      <div className="lg:hidden">
        {eventsInMonth.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <CalendarIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Aucun événement ce mois-ci
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Array.from(eventsByDayForList.entries()).map(([dayKey, dayEvents]) => {
              const firstEventDate = DateTime.fromISO(dayEvents[0].startDateTime);
              const isEventToday =
                firstEventDate.day === today.day &&
                firstEventDate.month === today.month &&
                firstEventDate.year === today.year;

              return (
                <div key={dayKey} className="space-y-3">
                  {/* En-tête du jour */}
                  <div
                    className={`sticky top-16 z-10 py-3 px-4 rounded-lg font-bold text-lg capitalize ${isEventToday
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                      }`}
                  >
                    {dayKey}
                    {isEventToday && " - Aujourd'hui"}
                  </div>

                  {/* Événements du jour */}
                  <div className="space-y-3">
                    {dayEvents.map((event) => {
                      const lair = lairsMap.get(event.lairId);
                      const eventDate = DateTime.fromISO(event.startDateTime);
                      const endDate = DateTime.fromISO(event.endDateTime);
                      const timeStr = eventDate.toLocaleString(DateTime.TIME_24_SIMPLE);
                      const endTimeStr = endDate.toLocaleString(DateTime.TIME_24_SIMPLE);

                      const cardContent = (
                        <Card
                          className={`hover:shadow-lg transition-shadow ${event.status === "available"
                            ? "border-l-4 border-l-green-500"
                            : event.status === "sold-out"
                              ? "border-l-4 border-l-red-500"
                              : "border-l-4 border-l-gray-400"
                            } ${event.url ? "cursor-pointer hover:bg-accent" : ""}`}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-xl">
                                {event.name}
                              </CardTitle>
                              <Badge variant={getStatusVariant(event.status)}>
                                {getStatusLabel(event.status)}
                              </Badge>
                            </div>
                          </CardHeader>

                          <CardContent className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                              <CalendarIcon className="h-4 w-4" />
                              {timeStr} - {endTimeStr}
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {lair?.name || "Lieu inconnu"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                              <span>{event.gameName}</span>
                            </div>
                            {event.price && (
                              <div className="flex items-center gap-2 text-sm">
                                <Euro className="h-4 w-4 text-muted-foreground" />
                                <span className="font-semibold">{event.price}€</span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );

                      return event.url ? (
                        <Link
                          key={event.id}
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {cardContent}
                        </Link>
                      ) : (
                        <div key={event.id}>
                          {cardContent}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
