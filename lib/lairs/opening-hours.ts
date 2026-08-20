import { DateTime } from "luxon";
import type { LairOpeningHours } from "@/lib/types/Lair";

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function minutesOf(time: string | undefined): number | null {
  const match = time && TIME.exec(time.trim());
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export type LairOpeningState = {
  /** Le lieu est-il ouvert à l'instant ? `null` si les horaires sont inconnus. */
  isOpen: boolean | null;
  /** La plage du jour, si le lieu ouvre aujourd'hui. */
  today: LairOpeningHours | null;
  /** L'heure de fermeture du jour, « 19h » / « 19h30 », pour la ligne de bannière. */
  closesAt: string | null;
};

/**
 * Formate une heure d'ouverture à la française : « 10h », « 19h30 ».
 *
 * Sur les autres langues, le séparateur horaire local reprend la main — un
 * anglophone lit « 7:30 PM » et non « 19h30 ».
 */
export function formatOpeningTime(time: string | undefined, locale: string): string | null {
  const minutes = minutesOf(time);
  if (minutes === null) {
    return null;
  }

  const moment = DateTime.fromObject(
    { hour: Math.floor(minutes / 60), minute: minutes % 60 },
    { locale },
  );

  if (locale.startsWith("fr")) {
    return moment.minute === 0 ? `${moment.hour}h` : moment.toFormat("H'h'mm");
  }

  return moment.toLocaleString(
    moment.minute === 0 ? { hour: "numeric" } : DateTime.TIME_SIMPLE,
  );
}

/** La plage d'un jour, « 10h — 19h », ou `null` si le lieu est fermé ce jour-là. */
export function formatOpeningRange(hours: LairOpeningHours | undefined, locale: string): string | null {
  const open = formatOpeningTime(hours?.open, locale);
  const close = formatOpeningTime(hours?.close, locale);

  if (!open) {
    return null;
  }

  return close ? `${open} — ${close}` : open;
}

/**
 * L'état d'ouverture du lieu, maintenant.
 *
 * Une plage qui se termine avant son début — « 20h — 02h » — est lue comme
 * débordant sur le lendemain : c'est le cas d'un lieu qui ferme après minuit,
 * et le traiter autrement le déclarerait fermé toute la soirée.
 */
export function readOpeningState(
  openingHours: LairOpeningHours[] | undefined,
  locale: string,
  now: DateTime = DateTime.now(),
): LairOpeningState {
  if (!openingHours || openingHours.length === 0) {
    return { isOpen: null, today: null, closesAt: null };
  }

  const today = openingHours.find((hours) => hours.day === now.weekday) ?? null;
  const yesterday = openingHours.find((hours) => hours.day === (now.weekday === 1 ? 7 : now.weekday - 1));

  const nowMinutes = now.hour * 60 + now.minute;

  const isWithin = (hours: LairOpeningHours | null | undefined, offset: number): boolean => {
    const open = minutesOf(hours?.open);
    const close = minutesOf(hours?.close);
    if (open === null || close === null) {
      return false;
    }

    // Une plage qui déborde sur le lendemain se lit sur deux jours : depuis
    // l'ouverture de la veille, et jusqu'à la fermeture du jour même.
    const end = close <= open ? close + 24 * 60 : close;
    return nowMinutes + offset >= open && nowMinutes + offset < end;
  };

  const isOpen = isWithin(today, 0) || isWithin(yesterday, 24 * 60);

  return {
    isOpen,
    today,
    closesAt: today?.close ? formatOpeningTime(today.close, locale) : null,
  };
}

/** Les sept jours, dans l'ordre de la semaine, complétés par les jours fermés. */
export function weekOf(openingHours: LairOpeningHours[] | undefined): LairOpeningHours[] {
  return [1, 2, 3, 4, 5, 6, 7].map(
    (day) => openingHours?.find((hours) => hours.day === day) ?? { day },
  );
}
