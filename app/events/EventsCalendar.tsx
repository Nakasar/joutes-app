"use client";

import { Event } from "@/lib/types/Event";
import { Lair } from "@/lib/types/Lair";
import { useState, useMemo } from "react";

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

  const getStatusColor = (status: Event["status"]) => {
    switch (status) {
      case "available":
        return "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200";
      case "sold-out":
        return "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200";
      case "cancelled":
        return "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400";
      default:
        return "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200";
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
    <div>
      {/* En-tête avec navigation */}
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
        <button
          onClick={goToPreviousMonth}
          className="w-full sm:w-auto px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
        >
          ← Mois précédent
        </button>

        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-bold">
            {monthNames[currentMonth]} {currentYear}
          </h2>
          {(currentMonth !== today.getMonth() ||
            currentYear !== today.getFullYear()) && (
            <button
              onClick={goToCurrentMonth}
              className="mt-2 text-sm sm:text-base text-blue-500 hover:text-blue-700 underline"
            >
              Revenir au mois actuel
            </button>
          )}
        </div>

        <button
          onClick={goToNextMonth}
          className="w-full sm:w-auto px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
        >
          Mois suivant →
        </button>
      </div>

      {/* Vue calendrier (cachée sur mobile) */}
      <div className="hidden lg:block bg-white dark:bg-gray-900 rounded-lg shadow-lg p-4">
        {/* En-têtes des jours de la semaine */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {dayNames.map((dayName) => (
            <div
              key={dayName}
              className="text-center font-semibold text-gray-600 dark:text-gray-400 py-2"
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
              className={`min-h-[120px] border rounded-lg p-2 ${
                day === null
                  ? "bg-gray-50 dark:bg-gray-800"
                  : isToday(day)
                  ? "bg-blue-50 dark:bg-blue-950 border-blue-500"
                  : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              }`}
            >
              {day !== null && (
                <>
                  <div
                    className={`text-sm font-semibold mb-1 ${
                      isToday(day)
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-300"
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
                          className={`text-xs p-1 rounded ${getStatusColor(
                            event.status
                          )}`}
                        >
                          <div className="font-semibold truncate" title={event.name}>
                            {startTime} - {event.name}
                          </div>
                          <div className="text-xs truncate" title={lair?.name}>
                            📍 {lair?.name || "Lieu inconnu"}
                          </div>
                          <div className="text-xs">
                            🎮 {event.gameName}
                          </div>
                          <div className="text-xs font-semibold">
                            {getStatusLabel(event.status)}
                            {event.price && ` - ${event.price}€`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Vue liste (visible sur mobile et tablette) */}
      <div className="lg:hidden">
        {eventsInMonth.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
            <p className="text-gray-500 dark:text-gray-400">
              Aucun événement ce mois-ci
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {eventsInMonth.map((event) => {
              const lair = lairsMap.get(event.lairId);
              const eventDate = new Date(event.startDateTime);
              const endDate = new Date(event.endDateTime);
              const dateStr = eventDate.toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              });
              const timeStr = eventDate.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const endTimeStr = endDate.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const isEventToday =
                eventDate.getDate() === today.getDate() &&
                eventDate.getMonth() === today.getMonth() &&
                eventDate.getFullYear() === today.getFullYear();

              return (
                <div
                  key={event.id}
                  className={`bg-white dark:bg-gray-900 rounded-lg shadow-lg p-4 border-l-4 ${
                    isEventToday
                      ? "border-blue-500"
                      : event.status === "available"
                      ? "border-green-500"
                      : event.status === "sold-out"
                      ? "border-red-500"
                      : "border-gray-400"
                  }`}
                >
                  {/* Date et heure */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                        {dateStr}
                      </div>
                      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {timeStr} - {endTimeStr}
                      </div>
                    </div>
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                        event.status
                      )}`}
                    >
                      {getStatusLabel(event.status)}
                    </div>
                  </div>

                  {/* Nom de l'événement */}
                  <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">
                    {event.name}
                  </h3>

                  {/* Informations */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <span className="text-lg">📍</span>
                      <span className="font-medium">
                        {lair?.name || "Lieu inconnu"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <span className="text-lg">🎮</span>
                      <span>{event.gameName}</span>
                    </div>
                    {event.price && (
                      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        <span className="text-lg">💰</span>
                        <span className="font-semibold">{event.price}€</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Légende (visible uniquement sur grand écran avec le calendrier) */}
      <div className="hidden lg:flex mt-6 flex-wrap gap-4 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-100 dark:bg-green-900 rounded"></div>
          <span className="text-sm">Disponible</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-100 dark:bg-red-900 rounded"></div>
          <span className="text-sm">Complet</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-100 dark:bg-gray-800 rounded"></div>
          <span className="text-sm">Annulé</span>
        </div>
      </div>
    </div>
  );
}
