import { DateTime } from "luxon";

import type { Event } from "@/lib/types/Event";
import type { Game } from "@/lib/types/Game";
import type { PosterDay, PosterRange, PosterWeek } from "@/lib/posters/period";

/**
 * Ce qu'un style d'affiche reçoit : des chaînes prêtes à poser, jamais une
 * date ou un prix à formater. Sept styles qui formateraient chacun l'heure
 * finiraient par sept façons de l'écrire.
 */
export type PosterGame = {
  name: string;
  /** Un nom court pour la tuile-logo, quand le jeu n'a pas d'image. */
  short: string;
  color: string;
  /** L'image du jeu, quand il en a une et que le lieu veut les logos. */
  icon?: string;
};

export type PosterEvent = {
  id: string;
  name: string;
  /** « 19:30 – 23:00 », ou « 19:30 » quand la fin manque ou tombe un autre jour. */
  time: string;
  /** « 19h30 – 23h00 » — la même chose à la française, pour les styles anciens. */
  timeFr: string;
  /** « mar. 1 » */
  dateShort: string;
  game: PosterGame;
  /** « 8 € », « entrée libre », ou rien quand le prix n'est pas renseigné. */
  price?: string;
  /** « 6/16 places », quand l'événement a une capacité. */
  seats?: string;
  full: boolean;
};

export type PosterDayView = {
  /** « Lundi » */
  name: string;
  /** « Lun » */
  short: string;
  /** 7 */
  number: number;
  /** « 07 » */
  padded: string;
  events: PosterEvent[];
};

export type PosterWeekView = {
  /** « 1 – 6 septembre » */
  label: string;
  /** « 1 – 6 sept. » */
  short: string;
  isoWeek: number;
  events: PosterEvent[];
};

export type PosterLabels = {
  /** Le titre de la période : « 7 – 13 septembre » ou « Septembre ». */
  big: string;
  /** Sous le titre : « 2026 ». */
  year: string;
  /** La phrase entière : « du lundi 7 au dimanche 13 septembre 2026 ». */
  long: string;
  /** « 07.09.2026 » et « 13.09.2026 », pour les styles qui préfèrent les chiffres. */
  startNumeric: string;
  endNumeric: string;
  /** Le numéro de semaine ISO, en semaine. */
  isoWeek: number;
};

export type PosterStrings = {
  free: string;
  /** « {registered}/{capacity} places » */
  seats: (registered: number, capacity: number) => string;
};

export type PosterGameOptions = {
  /** Faux : jamais d'image, le nom seul. */
  logos: boolean;
};

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1);

/**
 * Un nom de jeu court pour une tuile : « Magic: The Gathering » → « Magic »,
 * « One Piece Card Game » → « One Piece ». Ce qui suit un deux-points ou un
 * tiret est un sous-titre ; « Card Game », « TCG » et « Unlimited » sont des
 * suffixes de gamme que personne n'emploie à l'oral.
 */
export function shortGameName(name: string): string {
  const head = name
    .split(/[:(–—-]/)[0]
    .replace(/\b(trading card game|card game|tcg|unlimited)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return head.length > 0 ? head : name;
}

export function posterGame(
  name: string,
  games: Record<string, Pick<Game, "color" | "images">>,
  options: PosterGameOptions,
): PosterGame {
  const known = games[name];

  return {
    name,
    short: shortGameName(name),
    color: known?.color || "#737373",
    icon: options.logos ? known?.images?.icon || undefined : undefined,
  };
}

export function formatPrice(price: number | undefined, locale: string, strings: PosterStrings): string | undefined {
  if (typeof price !== "number") {
    return undefined;
  }

  if (price <= 0) {
    return strings.free;
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
  }).format(price);
}

export function posterEvent(
  event: Event,
  locale: string,
  zone: string,
  games: Record<string, Pick<Game, "color" | "images">>,
  strings: PosterStrings,
  options: PosterGameOptions,
): PosterEvent {
  const start = DateTime.fromISO(event.startDateTime, { zone }).setLocale(locale);
  const end = DateTime.fromISO(event.endDateTime, { zone }).setLocale(locale);
  const sameDay = end.isValid && end.hasSame(start, "day") && end > start;

  const time = sameDay ? `${start.toFormat("HH:mm")} – ${end.toFormat("HH:mm")}` : start.toFormat("HH:mm");
  const registered = event.registeredParticipantsCount ?? event.participants?.length ?? 0;

  return {
    id: event.id,
    name: event.name,
    time,
    timeFr: time.replace(/:/g, "h"),
    dateShort: start.toFormat("ccc d"),
    game: posterGame(event.gameName, games, options),
    price: formatPrice(event.price, locale, strings),
    seats: event.maxParticipants ? strings.seats(registered, event.maxParticipants) : undefined,
    full: event.status === "sold-out",
  };
}

export function posterDayView(day: PosterDay, locale: string, events: PosterEvent[]): PosterDayView {
  const date = day.date.setLocale(locale);

  return {
    name: capitalize(date.toFormat("cccc")),
    short: capitalize(date.toFormat("ccc")).replace(/\.$/, ""),
    number: date.day,
    padded: date.toFormat("dd"),
    events,
  };
}

/** « 1 – 6 septembre », ou « 28 sept. – 4 oct. » quand la semaine change de mois. */
function spanLabel(start: DateTime, end: DateTime, monthFormat: string): string {
  if (start.hasSame(end, "month")) {
    return `${start.day} – ${end.toFormat(`d ${monthFormat}`)}`;
  }

  return `${start.toFormat(`d ${monthFormat}`)} – ${end.toFormat(`d ${monthFormat}`)}`;
}

export function posterWeekView(week: PosterWeek, locale: string, events: PosterEvent[]): PosterWeekView {
  const start = week.start.setLocale(locale);
  const end = week.end.setLocale(locale);

  return {
    label: spanLabel(start, end, "MMMM"),
    short: spanLabel(start, end, "MMM"),
    isoWeek: week.isoWeek,
    events,
  };
}

export function posterLabels(range: PosterRange, locale: string): PosterLabels {
  const start = range.start.setLocale(locale);
  const end = range.end.setLocale(locale);

  if (range.period === "month") {
    return {
      big: capitalize(start.toFormat("MMMM")),
      year: start.toFormat("yyyy"),
      long: start.toFormat("MMMM yyyy"),
      startNumeric: start.toFormat("dd.MM.yyyy"),
      endNumeric: end.toFormat("dd.MM.yyyy"),
      isoWeek: start.weekNumber,
    };
  }

  return {
    big: spanLabel(start, end, "MMMM"),
    year: end.toFormat("yyyy"),
    long: `${start.toFormat("cccc d")} – ${end.toFormat("cccc d MMMM yyyy")}`,
    startNumeric: start.toFormat("dd.MM.yyyy"),
    endNumeric: end.toFormat("dd.MM.yyyy"),
    isoWeek: start.weekNumber,
  };
}
