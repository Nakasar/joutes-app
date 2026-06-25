"use client";

import { useEffect, useState } from "react";
import { Event } from "@/lib/types/Event";
import { Lair } from "@/lib/types/Lair";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Clock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";

interface FeaturedEventsAgendaProps {
  featuredLairs: Lair[];
  gameName: string;
}

export function FeaturedEventsAgenda({
  featuredLairs,
  gameName,
}: FeaturedEventsAgendaProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("Games");
  const locale = useLocale();

  useEffect(() => {
    if (featuredLairs.length === 0) {
      setLoading(false);
      return;
    }

    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const lairIds = featuredLairs.map((lair) => lair.id);
        const eventsPromises = lairIds.map(async (lairId) => {
          const response = await fetch(
            `/api/events?lairId=${lairId}&gameName=${encodeURIComponent(
              gameName
            )}&limit=50`
          );
          if (!response.ok) throw new Error(t("detail.events.fetchError"));
          const data = await response.json();
          return data.events || [];
        });

        const eventsArrays = await Promise.all(eventsPromises);
        const allEvents = eventsArrays.flat();

        const futureEvents = allEvents
          .filter((event) => new Date(event.startDateTime) > new Date())
          .sort(
            (a, b) =>
              new Date(a.startDateTime).getTime() -
              new Date(b.startDateTime).getTime()
          );

        setEvents(futureEvents);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("detail.events.fetchError")
        );
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [featuredLairs, gameName, t]);

  if (featuredLairs.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-white">{t("detail.events.upcoming")}</h2>
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-8">
          <p className="text-gray-400 text-center">
            {t("detail.events.loading")}
          </p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-white">{t("detail.events.upcoming")}</h2>
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-8">
          <p className="text-red-400 text-center">{error}</p>
        </div>
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-white">{t("detail.events.upcoming")}</h2>
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-8">
          <p className="text-gray-400 text-center">
            {t("detail.events.none")}
          </p>
        </div>
      </section>
    );
  }

  const eventsByLair = events.reduce((acc, event) => {
    const lairId = event.lairId || "unknown";
    if (!acc[lairId]) {
      acc[lairId] = [];
    }
    acc[lairId].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  const formatDate = (dateString: string) => {
    return DateTime.fromISO(dateString).setLocale(locale).toLocaleString({
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  const formatTime = (dateString: string) => {
    return DateTime.fromISO(dateString).setLocale(locale).toFormat("HH:mm");
  };

  const getStatusBadge = (status: Event["status"]) => {
    switch (status) {
      case "available":
        return (
          <Badge variant="secondary" className="bg-green-500/20 text-green-300">
            {t("detail.events.status.available")}
          </Badge>
        );
      case "sold-out":
        return (
          <Badge variant="secondary" className="bg-orange-500/20 text-orange-300">
            {t("detail.events.status.soldOut")}
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary" className="bg-red-500/20 text-red-300">
            {t("detail.events.status.cancelled")}
          </Badge>
        );
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-white">{t("detail.events.upcoming")}</h2>
        <p className="text-gray-400">
          {events.length > 1 ? t("detail.events.countPlural", { count: events.length }) : t("detail.events.countSingular", { count: events.length })}
        </p>
      </div>

      <div className="space-y-8">
        {featuredLairs.map((lair) => {
          const lairEvents = eventsByLair[lair.id] || [];
          if (lairEvents.length === 0) return null;

          return (
            <div key={lair.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-blue-400" />
                <Link
                  href={`/lairs/${lair.id}`}
                  className="text-xl font-semibold text-white hover:text-blue-400 transition-colors"
                >
                  {lair.name}
                </Link>
                {lair.address && (
                  <span className="text-gray-400 text-sm">{lair.address}</span>
                )}
              </div>

              <div className="space-y-2">
                {lairEvents.map((event) => (
                  <Card
                    key={event.id}
                    className="bg-white/5 backdrop-blur-sm border-white/10 hover:bg-white/10 transition-all"
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center justify-center bg-blue-500/20 rounded-lg p-3 min-w-[80px]">
                          <Calendar className="h-5 w-5 text-blue-400 mb-1" />
                          <div className="text-center">
                            <div className="text-white font-bold">
                              {formatDate(event.startDateTime)}
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-lg font-semibold text-white">
                              {event.name}
                            </h3>
                            {getStatusBadge(event.status)}
                          </div>

                          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-400">
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {formatTime(event.startDateTime)}
                              {event.endDateTime &&
                                ` - ${formatTime(event.endDateTime)}`}
                            </div>

                            {event.price !== undefined && event.price > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-white">
                                  {event.price}€
                                </span>
                              </div>
                            )}

                            {event.url && (
                              <Link
                                href={event.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                              >
                                <ExternalLink className="h-4 w-4" />
                                {t("detail.events.moreInfo")}
                              </Link>
                            )}
                          </div>

                          {event.maxParticipants && (
                            <div className="mt-2 text-sm text-gray-400">
                              {t("detail.events.participants", { registered: event.registeredParticipantsCount ?? 0, max: event.maxParticipants })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
