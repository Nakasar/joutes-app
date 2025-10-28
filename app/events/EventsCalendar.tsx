"use client";

import { Event } from "@/lib/types/Event";
import { Lair } from "@/lib/types/Lair";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Gamepad2, Euro } from "lucide-react";
import Link from "next/link";

type EventsCalendarProps = {
  events: Event[];
  lairsMap: Map<string, Lair>;
};

export default function EventsCalendar({ events, lairsMap }: EventsCalendarProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  // Navigation entre les mois
  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToCurrentMonth = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  // Obtenir le nombre de jours dans le mois
  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Obtenir le premier jour de la semaine du mois (0 = dimanche, 1 = lundi, etc.)
  const getFirstDayOfMonth = (month: number, year: number) => {
    const day = new Date(year, month, 1).getDay();
    // Convertir pour que lundi soit 0 et dimanche soit 6
    return day === 0 ? 6 : day - 1;
  };

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDayOfWeek = getFirstDayOfMonth(currentMonth, currentYear);

  // Filtrer les événements pour le mois actuel
  const eventsInMonth = useMemo(() => {
    return events.filter((event) => {
      const eventDate = new Date(event.startDateTime);
      return (
        eventDate.getMonth() === currentMonth &&
        eventDate.getFullYear() === currentYear
      );
    }).sort((a, b) => {
      // Trier par date de début
      return new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime();
    });
  }, [events, currentMonth, currentYear]);

  // Organiser les événements par jour
  const eventsByDay = new Map<number, Event[]>();
  eventsInMonth.forEach((event) => {
    const day = new Date(event.startDateTime).getDate();
    if (!eventsByDay.has(day)) {
      eventsByDay.set(day, []);
    }
    eventsByDay.get(day)?.push(event);
  });

  // Grouper les événements par jour pour la vue liste (mobile)
  const eventsByDayForList = useMemo(() => {
    const grouped = new Map<string, Event[]>();
    eventsInMonth.forEach((event) => {
      const eventDate = new Date(event.startDateTime);
      const dayKey = eventDate.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
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
      day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
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
                {monthNames[currentMonth]} {currentYear}
              </CardTitle>
              {(currentMonth !== today.getMonth() ||
                currentYear !== today.getFullYear()) && (
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
                          const startTime = new Date(
                            event.startDateTime
                          ).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          return (
                            <div
                              key={event.id}
                              className="text-xs p-2 rounded-md bg-background border"
                            >
                              <div className="font-semibold truncate mb-1" title={event.name}>
                                {startTime} - {event.name}
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
                              {event.url &&
                                <Button asChild>
                                  <Link href={event.url} target="_blank" rel="noopener noreferrer">
                                    Voir l&apos;événement
                                  </Link>
                                </Button>
                              }
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
              const firstEventDate = new Date(dayEvents[0].startDateTime);
              const isEventToday =
                firstEventDate.getDate() === today.getDate() &&
                firstEventDate.getMonth() === today.getMonth() &&
                firstEventDate.getFullYear() === today.getFullYear();

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
                      const eventDate = new Date(event.startDateTime);
                      const endDate = new Date(event.endDateTime);
                      const timeStr = eventDate.toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const endTimeStr = endDate.toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      return (
                        <Card
                          key={event.id}
                          className={`hover:shadow-lg transition-shadow ${event.status === "available"
                            ? "border-l-4 border-l-green-500"
                            : event.status === "sold-out"
                              ? "border-l-4 border-l-red-500"
                              : "border-l-4 border-l-gray-400"
                            }`}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                                <CalendarIcon className="h-4 w-4" />
                                {timeStr} - {endTimeStr}
                              </div>
                              <Badge variant={getStatusVariant(event.status)}>
                                {getStatusLabel(event.status)}
                              </Badge>
                            </div>
                            <CardTitle className="text-xl">
                              {event.name}
                            </CardTitle>
                          </CardHeader>

                          <CardContent className="space-y-2">
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
                            {event.url &&
                              <Button asChild>
                                <Link href={event.url} target="_blank" rel="noopener noreferrer">
                                  Voir l&apos;événement
                                </Link>
                              </Button>
                            }
                          </CardContent>
                        </Card>
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
