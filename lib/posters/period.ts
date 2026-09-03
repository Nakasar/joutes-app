import { DateTime, Interval } from "luxon";

import type { Event } from "@/lib/types/Event";
import type { PosterPeriod } from "@/lib/posters/styles";

/** Le fuseau des lieux : ils sont en France, leurs horaires aussi. */
export const POSTER_ZONE = "Europe/Paris";

/**
 * La fenêtre que couvre une affiche.
 *
 * Une semaine va du lundi au dimanche, un mois du 1er au dernier jour ;
 * `start` est le jour qui a servi à la choisir — n'importe lequel de la
 * période —, ce qui permet à l'écran de gestion de passer d'une période à
 * l'autre en ajoutant sept jours ou un mois sans recalculer de bornes.
 */
export type PosterRange = {
  period: PosterPeriod;
  /** Le premier jour, à minuit. */
  start: DateTime;
  /** Le dernier jour, à minuit — la période va jusqu'à sa fin de journée. */
  end: DateTime;
};

/** Un jour de l'affiche hebdomadaire, avec ses événements dans l'ordre. */
export type PosterDay = {
  date: DateTime;
  events: Event[];
};

/**
 * Une semaine de l'affiche mensuelle, coupée aux bornes du mois : la première
 * peut commencer un jeudi, la dernière finir un mardi.
 */
export type PosterWeek = {
  start: DateTime;
  end: DateTime;
  isoWeek: number;
  events: Event[];
};

/**
 * Le jour demandé par l'URL, ou aujourd'hui.
 *
 * Une date illisible vaut aujourd'hui : l'affiche se rend toujours, et le
 * gérant voit tout de suite ce qu'il a plutôt qu'une erreur.
 */
export function readPosterStart(
  value: string | undefined,
  zone: string = POSTER_ZONE,
  now: DateTime = DateTime.now().setZone(zone),
): DateTime {
  const parsed = value ? DateTime.fromISO(value, { zone }) : DateTime.invalid("absent");
  return (parsed.isValid ? parsed : now).startOf("day");
}

export function posterRange(period: PosterPeriod, start: DateTime): PosterRange {
  const unit = period === "week" ? "week" : "month";
  const first = start.startOf(unit);

  return { period, start: first, end: first.endOf(unit).startOf("day") };
}

/** Les événements de la période, sans les annulés, du plus tôt au plus tard. */
export function eventsInRange(events: Event[], range: PosterRange, zone?: string): Event[] {
  const interval = Interval.fromDateTimes(range.start, range.end.endOf("day"));

  return events
    .filter((event) => event.status !== "cancelled")
    .filter((event) => {
      const start = DateTime.fromISO(event.startDateTime, zone ? { zone } : undefined);
      return start.isValid && interval.contains(start);
    })
    .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
}

/**
 * Les sept jours de la semaine, chacun avec ses événements — les jours vides
 * compris : l'affiche décide elle-même de les montrer ou non.
 */
export function groupByDay(events: Event[], range: PosterRange, zone?: string): PosterDay[] {
  const days: PosterDay[] = [];

  for (let cursor = range.start; cursor <= range.end; cursor = cursor.plus({ days: 1 })) {
    days.push({
      date: cursor,
      events: events.filter((event) =>
        DateTime.fromISO(event.startDateTime, zone ? { zone } : undefined).hasSame(cursor, "day"),
      ),
    });
  }

  return days;
}

/**
 * Les semaines du mois, coupées à ses bornes, sans les semaines vides : une
 * affiche mensuelle liste ce qui a lieu, elle n'est pas un calendrier.
 */
export function groupByWeek(events: Event[], range: PosterRange, zone?: string): PosterWeek[] {
  const weeks: PosterWeek[] = [];

  for (let cursor = range.start; cursor <= range.end; cursor = cursor.plus({ weeks: 1 }).startOf("week")) {
    const weekEnd = cursor.endOf("week").startOf("day");
    const end = weekEnd < range.end ? weekEnd : range.end;
    const interval = Interval.fromDateTimes(cursor, end.endOf("day"));
    const inWeek = events.filter((event) =>
      interval.contains(DateTime.fromISO(event.startDateTime, zone ? { zone } : undefined)),
    );

    if (inWeek.length > 0) {
      weeks.push({ start: cursor, end, isoWeek: cursor.weekNumber, events: inWeek });
    }
  }

  return weeks;
}
